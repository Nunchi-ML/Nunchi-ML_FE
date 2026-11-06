import * as THREE from 'three';
import { at, ROAD_W, UNDERPASSES } from './road';

/** Authored spatial roof shade, also without mobile shadow maps.
 * Daylight outside the portal and emissive tunnel lamps stay bright.
 */
export function createTunnelLighting(scene: THREE.Scene) {
  const uniforms = {
    tunnelEnabled: { value: 0 }, tunnelPoints: { value: Array.from({ length: 9 }, () => new THREE.Vector2()) },
    tunnelBounds: { value: new THREE.Vector4() }, tunnelLength: { value: 1 }, tunnelRoof: { value: 0 },
    tunnelHalfWidth: { value: ROAD_W / 2 + 8 },
  };
  if (UNDERPASSES.length) {
    const materials = new Set<THREE.MeshStandardMaterial>();
    scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
        if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.add(material as THREE.MeshStandardMaterial);
      }
    });
    for (const material of materials) {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `varying vec3 vTunnelWorld;\n${shader.vertexShader}`.replace('#include <project_vertex>', `
          #include <project_vertex>
          vec4 tunnelPosition=vec4(transformed,1.);
          #ifdef USE_INSTANCING
            tunnelPosition=instanceMatrix*tunnelPosition;
          #endif
          vTunnelWorld=(modelMatrix*tunnelPosition).xyz;
        `);
        shader.fragmentShader = `varying vec3 vTunnelWorld;
          uniform float tunnelEnabled,tunnelRoof,tunnelHalfWidth,tunnelLength;
          uniform vec2 tunnelPoints[9]; uniform vec4 tunnelBounds;\n${shader.fragmentShader}`.replace('#include <lights_fragment_end>', `
          #include <lights_fragment_end>
          float tunnelLight=1.;
          if(tunnelEnabled>.5 && vTunnelWorld.y<tunnelRoof+.25
            && all(greaterThanEqual(vTunnelWorld.xz,tunnelBounds.xy))
            && all(lessThanEqual(vTunnelWorld.xz,tunnelBounds.zw))){
            float across=100000.,along=0.;
            for(int i=0;i<8;i++){
              vec2 axis=tunnelPoints[i+1]-tunnelPoints[i];
              float t=clamp(dot(vTunnelWorld.xz-tunnelPoints[i],axis)/max(.01,dot(axis,axis)),0.,1.);
              float distance=length(vTunnelWorld.xz-(tunnelPoints[i]+axis*t));
              if(distance<across){across=distance;along=(float(i)+t)*tunnelLength/8.;}
            }
            float penetration=min(along,tunnelLength-along);
            float roofShade=smoothstep(0.,3.,penetration)
              *(1.-smoothstep(tunnelHalfWidth-.5,tunnelHalfWidth,across))
              *(1.-smoothstep(tunnelRoof,tunnelRoof+.25,vTunnelWorld.y));
            tunnelLight=mix(1.,.12+.65*exp(-max(0.,penetration)/8.),roofShade);
          }
          reflectedLight.directDiffuse*=tunnelLight;
          reflectedLight.indirectDiffuse*=tunnelLight;
          reflectedLight.directSpecular*=tunnelLight;
          reflectedLight.indirectSpecular*=tunnelLight;
        `);
      };
      material.customProgramCacheKey = () => 'nunchi-covered-light-curved-v2';
    }
  }
  let sectionKey = '';
  return {
    update(s: number) {
      const distance = (u: typeof UNDERPASSES[number]) => Math.max(u.s0 - s, s - u.s1, 0);
      const section = UNDERPASSES.filter(u => s >= u.s0 - u.ramp - 150 && s <= u.s1 + u.ramp + 150).sort((a,b)=>distance(a)-distance(b))[0];
      uniforms.tunnelEnabled.value = section ? 1 : 0;
      if (!section) return;
      const key = section.osmWayIds.join('-'); if (key === sectionKey) return; sectionKey = key;
      let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,roof=-Infinity;
      uniforms.tunnelPoints.value.forEach((point,i)=>{
        const p=at(section.s0+(section.s1-section.s0)*i/8);point.set(p.x,p.z);
        minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);roof=Math.max(roof,p.y+section.clearance);
      });
      const margin=uniforms.tunnelHalfWidth.value;
      uniforms.tunnelBounds.value.set(minX-margin,minZ-margin,maxX+margin,maxZ+margin);
      uniforms.tunnelLength.value=section.s1-section.s0; uniforms.tunnelRoof.value=roof;
    },
  };
}
