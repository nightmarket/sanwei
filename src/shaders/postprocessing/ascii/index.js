import * as THREE from "three";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader";

const fragmentShader = `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform float uPixelSize;
  uniform vec2 uResolution;

  uniform sampler2D tAscii;
  uniform vec2 uCharCount;
  uniform bool uShowBackground;
  
  varying vec2 vUv;

  void main() {
    vec2 normalizedPixelSize = uPixelSize / uResolution;
    vec2 pixelatedUvs = normalizedPixelSize * floor(vUv / normalizedPixelSize);
    vec4 color = texture2D(tDiffuse, pixelatedUvs);

    vec2 pix = vUv * uResolution.xy;

    float luma = dot(vec3(0.2126, 0.7152, 0.0722), color.rgb);
    vec2 cellUV = fract(vUv / normalizedPixelSize);

    float charIndex = clamp(
        floor(luma * (uCharCount.x - 1.0)),
        0.0,
        uCharCount.x - 1.0
    );
    
    vec2 asciiUV = vec2(
        (charIndex + cellUV.x) / uCharCount.x,
        cellUV.y
    );
  
    float character = texture2D(tAscii, asciiUV).r;

    vec3 backgroundColor = vec3(0.0, 0.0, 0.0);
    if (uShowBackground) {
        backgroundColor = color.rgb;
    }

    gl_FragColor = vec4(character * vec3(1.0) * (luma + 0.01) + backgroundColor, 1.0);
  }
`;

export const ASCIIShader = {
  uniforms: {
    tDiffuse: { value: null },
    uPixelSize: { value: 4 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    tAscii: { value: null },
    uCharCount: { value: 10 },
    uShowBackground: { value: true },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader,
};
