import * as THREE from "three";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader";

const fragmentShader = `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform float uPixelSize;
  uniform vec2 uResolution;


  
  varying vec2 vUv;

  float crossSDF(vec2 p) {
    p = abs(p - 0.5);
    return min(p.x, p.y);
  }

  float circleSDF(vec2 p) {
      return length(p - 0.5);
  }

  float triangleSDF(vec2 p) {
      const float r = 1.0;
      const float k = sqrt(3.0);
      p.x = abs(p.x) - r;
      p.y = p.y + r/k;
      if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
      p.x -= clamp( p.x, -2.0*r, 0.0 );
      return -length(p)*sign(p.y);
  }

  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);


    vec2 normalizedPixelSize = uPixelSize / uResolution;
    vec4 blurredColor = vec4(0.0);
    vec2 pixel = vUv * uResolution;
    vec2 coord = pixel / uPixelSize;
    vec2 offsetUV = vUv;
    vec2 uvPixel = normalizedPixelSize * floor(offsetUV / normalizedPixelSize);


    vec4 color = texture2D(tDiffuse, uvPixel);

    float luma = dot(vec3(0.2126, 0.7152, 0.0722), color.rgb);
    color = vec4(1.0);
    vec2 cellUv = fract(coord);



    float d = circleSDF(cellUv);
    
    if (luma > 0.2) {
      if (d < 0.3) {
        color = vec4(0.0,0.31,0.933,1.0);
      } else {
        color = vec4(1.0,1.0,1.0,1.0);
      }
    }

    if(luma > 0.75) {
      if(d < 0.3) {
        color = vec4(1.0,1.0,1.0,1.0);
      } else {
        color = vec4(0.0,0.31,0.933,1.0);
      }
    }

    if(luma > 0.99) {
      color = vec4(0.0,0.31,0.933,1.0);
    }


    // float c = dot(vec3(0.2126, 0.7152, 0.0722), color.rgb);
    // color = vec4(c, c, c, 1.0);

    gl_FragColor = color;

  }
`;

export const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    uPixelSize: { value: 4 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader,
};
