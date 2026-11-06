import * as THREE from 'three';
export type WeatherKind = 'clear' | 'cloud' | 'over';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { v=clamp(v); return v*v*(3-2*v); };
const hash = (x: number, y: number) => { const v=Math.sin(x*127.1+y*311.7)*43758.5453; return v-Math.floor(v); };
function noise(x: number,y: number) {
  const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),fx),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),fx),fy);
}
function cloudTexture(weather: WeatherKind) {
  const width=1024,height=512,pixels=new Uint8Array(width*height*4),threshold={clear:.63,cloud:.43,over:.17}[weather];
  let sum=0,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width*28,v=y/height*16;
    const n=(noise(u,v)*.55+noise(u*2.1+17,v*2.1)*.28+noise(u*4.2,v*4.2+7)*.14+noise(u*8.4,v*8.4)*.07)/1.04;
    const sky=(y/(height-1)-.5)*2;
    const alpha=smooth((n-threshold)/.17)*smooth(sky/.045)*(weather==='clear'?.76:1);
    const shade=weather==='over'?194+n*42:222+n*32;
    pixels.set([shade,shade+2,shade+4,alpha*255],(y*width+x)*4);
    if(sky>0){sum+=alpha;count++;}
  }
  const map=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return {map,coverage:sum/count};
}
/** One batched sky dome: visible weather, no external imagery or weather API. */
export function createWeatherLayer(scene: THREE.Scene) {
  // Composite the sky and clouds together. An alpha-only cloud layer left the
  // atmospheric Sky's near-horizon haze looking identical in every preset.
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,
    uniforms:{cloudMap:{value:null},daylight:{value:1},overcast:{value:0},sunset:{value:0}},
    vertexShader:`varying vec2 cloudUv; varying float elevation;
      void main(){cloudUv=uv;elevation=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}`,
    fragmentShader:`uniform sampler2D cloudMap; uniform float daylight; uniform float overcast; uniform float sunset;
      varying vec2 cloudUv; varying float elevation;
      void main(){
        float h=smoothstep(0.,.6,max(0.,elevation));
        vec3 horizon=mix(vec3(.46,.67,.88),vec3(.85,.42,.18),sunset);
        vec3 blue=mix(horizon,vec3(.055,.24,.58),h);
        vec4 cloud=texture2D(cloudMap,cloudUv);
        vec3 cloudColor=mix(vec3(.52,.58,.65),vec3(.92,.95,1.),cloud.r);
        vec3 sky=mix(blue,vec3(.43,.48,.55),overcast*.9);
        sky=mix(sky,cloudColor,cloud.a);
        gl_FragColor=vec4(mix(vec3(.003,.006,.016),sky,daylight),1.);
      }`});
  const clouds=new THREE.Mesh(new THREE.SphereGeometry(5500,40,24),material);clouds.name='weather-cloud-layer';clouds.renderOrder=10;scene.add(clouds);
  const cache=new Map<WeatherKind,ReturnType<typeof cloudTexture>>();let current: WeatherKind|undefined;
  let coverage=0;
  return {clouds,get coverage(){return coverage;},
    update(position: THREE.Vector3,weather: WeatherKind,daylight: number,sunAltitude=40){
      if(current!==weather){if(!cache.has(weather))cache.set(weather,cloudTexture(weather));const entry=cache.get(weather)!;material.uniforms.cloudMap.value=entry.map;coverage=entry.coverage;current=weather;}
      clouds.position.copy(position);material.uniforms.daylight.value=daylight;
      material.uniforms.overcast.value=weather==='over'?1:0;
      material.uniforms.sunset.value=clamp((12-sunAltitude)/12)*daylight;
    },
    dispose(){scene.remove(clouds);cache.forEach(c=>c.map.dispose());clouds.geometry.dispose();material.dispose();},
  };
}
