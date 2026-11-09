import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Authored glare reduces forward-road visibility while preserving the cockpit. */
export function createLightGlare() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, sunUv: { value: new THREE.Vector2(.5, .5) },
      aspect: { value: 1 }, sunlight: { value: 0 }, exitLight: { value: 0 }, roadBottom: { value: .65 },
    },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform vec2 sunUv;uniform float aspect,sunlight,exitLight,roadBottom;
      varying vec2 vUv;
      void main(){
        vec4 scene=texture2D(tDiffuse,vUv);
        float roadMask=smoothstep(1.-roadBottom,1.-roadBottom+.09,vUv.y);
        vec2 d=(vUv-sunUv)*vec2(aspect,1.);
        float r=length(d), angle=atan(d.y,d.x+.000001);
        float core=.00016/(r*r+.00016);
        float corona=exp(-r*18.);
        float rays=pow(abs(cos(angle*3.+.18)),32.)*exp(-r*22.);
        float scatter=sunlight*(core*11.+corona*1.5+rays*1.1)*exp(-r*r/.09)*roadMask;
        // The light source and forward road lose contrast together. The mask
        // excludes the dashboard/navigation and remains zero without direct sun.
        float severe=smoothstep(.22,.72,sunlight);
        vec2 forwardUv=mix(sunUv,vec2(.5,max(1.-roadBottom+.16,.48)),.55);
        vec2 ahead=(vUv-forwardUv)*vec2(aspect,1.);
        float sourceVeil=exp(-dot(d/vec2(.35,.25),d/vec2(.35,.25)));
        float forwardVeil=exp(-dot(ahead/vec2(.42,.21),ahead/vec2(.42,.21)));
        float veil=severe*min(.96,sourceVeil*.80+forwardVeil*.90)*roadMask;
        if(veil>.002){
          vec2 radius=vec2(.009/aspect,.009);
          vec3 diffuse=texture2D(tDiffuse,vUv+radius).rgb+texture2D(tDiffuse,vUv-radius).rgb;
          diffuse+=texture2D(tDiffuse,vUv+vec2(radius.x,-radius.y)).rgb;
          diffuse+=texture2D(tDiffuse,vUv+vec2(-radius.x,radius.y)).rgb;
          scene.rgb=mix(scene.rgb,diffuse*.25,veil*.65);
        }
        scene.rgb=mix(scene.rgb,vec3(2.2,2.03,1.65),veil);
        // Bright outdoor surfaces overexpose first at an exit. Dark objects
        // and the dashboard retain their contrast instead of turning milky.
        float luminance=dot(scene.rgb,vec3(.2126,.7152,.0722));
        float bright=smoothstep(.28,.95,luminance);
        scene.rgb*=1.+exitLight*bright*4.6*roadMask;
        if(exitLight>.002 && roadMask>0.){
          // Short-lived diffusion around bright portal edges, never a white
          // screen overlay or a blur of the navigation display.
          vec2 radius=vec2(.016/aspect,.016);
          vec3 halo=max(texture2D(tDiffuse,vUv+vec2(radius.x,0.)).rgb-.5,vec3(0.));
          halo+=max(texture2D(tDiffuse,vUv-vec2(radius.x,0.)).rgb-.5,vec3(0.));
          halo+=max(texture2D(tDiffuse,vUv+vec2(0.,radius.y)).rgb-.5,vec3(0.));
          halo+=max(texture2D(tDiffuse,vUv-vec2(0.,radius.y)).rgb-.5,vec3(0.));
          scene.rgb+=min(halo*.25,vec3(2.))*exitLight*.9*roadMask;
        }
        scene.rgb+=vec3(1.,.93,.78)*scatter;
        gl_FragColor=scene;
      }`,
  });
  return { pass,
    maskBloom(material: THREE.ShaderMaterial) {
      material.uniforms.roadBottom = pass.uniforms.roadBottom;
      material.fragmentShader = `uniform float roadBottom;\n${material.fragmentShader.replace('void main()', 'void lightSourceMain()')}
        void main(){lightSourceMain();gl_FragColor*=smoothstep(1.-roadBottom,1.-roadBottom+.09,vUv.y);}`;
      material.needsUpdate = true;
    },
    update(x: number, y: number, width: number, height: number, sunlight: number, exitLight: number, roadBottom: number) {
      pass.uniforms.sunUv.value.set(x / width, 1 - y / height);
      pass.uniforms.aspect.value = width / height; pass.uniforms.sunlight.value = sunlight;
      pass.uniforms.exitLight.value = exitLight; pass.uniforms.roadBottom.value = roadBottom;
    },
  };
}
