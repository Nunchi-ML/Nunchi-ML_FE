import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Authored HDR scatter before tone mapping, without a full-screen white veil. */
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
        float r=length(d), angle=atan(d.y,d.x);
        float core=.000065/(r*r+.000065);
        float corona=exp(-r*26.);
        float rays=pow(abs(cos(angle*3.+.18)),42.)*exp(-r*32.);
        float scatter=sunlight*(core*8.+corona*.8+rays*.55)*roadMask;
        // Bright outdoor surfaces overexpose first at an exit. Dark objects
        // and the dashboard retain their contrast instead of turning milky.
        float luminance=dot(scene.rgb,vec3(.2126,.7152,.0722));
        float bright=smoothstep(.28,.95,luminance);
        scene.rgb*=1.+exitLight*bright*2.8*roadMask;
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
