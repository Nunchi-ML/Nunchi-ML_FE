import * as THREE from 'three';
import { at, ROAD_W, UNDERPASSES } from './road';

/** Authored spatial roof shade, also without mobile shadow maps.
 * Daylight outside the portal and emissive tunnel lamps stay bright.
 */
export function createTunnelLighting(scene: THREE.Scene) {
  const uniforms = {
    tunnelEnabled: { value: 0 }, tunnelStart: { value: new THREE.Vector2() },
    tunnelEnd: { value: new THREE.Vector2(1, 0) }, tunnelRoof: { value: 0 },
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
          uniform float tunnelEnabled,tunnelRoof,tunnelHalfWidth;
          uniform vec2 tunnelStart,tunnelEnd;\n${shader.fragmentShader}`.replace('#include <lights_fragment_end>', `
          #include <lights_fragment_end>
          vec2 tunnelAxis=tunnelEnd-tunnelStart;
          float tunnelLength=max(1.,length(tunnelAxis));
          tunnelAxis/=tunnelLength;
          vec2 tunnelOffset=vTunnelWorld.xz-tunnelStart;
          float tunnelAlong=dot(tunnelOffset,tunnelAxis);
          float tunnelAcross=abs(dot(tunnelOffset,vec2(-tunnelAxis.y,tunnelAxis.x)));
          float tunnelPenetration=min(tunnelAlong,tunnelLength-tunnelAlong);
          float roofShade=tunnelEnabled*smoothstep(0.,3.,tunnelPenetration)
            *(1.-smoothstep(tunnelHalfWidth-.5,tunnelHalfWidth,tunnelAcross))
            *(1.-smoothstep(tunnelRoof,tunnelRoof+.25,vTunnelWorld.y));
          float tunnelLight=mix(1.,.12+.65*exp(-max(0.,tunnelPenetration)/8.),roofShade);
          reflectedLight.directDiffuse*=tunnelLight;
          reflectedLight.indirectDiffuse*=tunnelLight;
          reflectedLight.directSpecular*=tunnelLight;
          reflectedLight.indirectSpecular*=tunnelLight;
        `);
      };
      material.customProgramCacheKey = () => 'nunchi-covered-light-v1';
    }
  }
  return {
    update(s: number) {
      const section = UNDERPASSES.find(u => s >= u.s0 - u.ramp - 150 && s <= u.s1 + u.ramp + 150);
      uniforms.tunnelEnabled.value = section ? 1 : 0;
      if (!section) return;
      const a = at(section.s0), b = at(section.s1);
      uniforms.tunnelStart.value.set(a.x, a.z); uniforms.tunnelEnd.value.set(b.x, b.z);
      uniforms.tunnelRoof.value = Math.max(a.y, b.y) + section.clearance;
    },
  };
}
