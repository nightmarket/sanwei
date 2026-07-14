import * as THREE from "three";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader";
export const KUWAHARA_SHADER_UNIFORMS = {
  uRadius: { value: 15, type: "i", label: "kernel size" },
  //   uDivisions: { value: 200, min: 0, max: 400, step: 20, label: "uDivisions" },
};

const fragmentShader = `
 #define SECTOR_COUNT 8

uniform int uRadius;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;

varying vec2 vUv;

float random(vec2 c) {
  return fract(sin(dot(c.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 sampleColor(vec2 offset) {
    vec2 coord = (gl_FragCoord.xy + offset) / uResolution;
    return texture2D(tDiffuse, coord).rgb;
}

float gaussianWeight(float distance, float sigma) {
    return exp(-(distance * distance) / (2.0 * sigma * sigma));
}

void getSectorVarianceAndAverageColor(float angle, float radius, out vec3 avgColor, out float variance) {
    vec3 weightedColorSum = vec3(0.0);
    vec3 weightedSquaredColorSum = vec3(0.0);
    float totalWeight = 0.0;

    float sigma = radius / 3.0;

    for (float r = 1.0; r <= radius; r += 1.0) {
        for (float a = -0.392699; a <= 0.392699; a += 0.196349) {
            vec2 sampleOffset = r * vec2(cos(angle + a), sin(angle + a));
            vec3 color = sampleColor(sampleOffset);
            float weight = gaussianWeight(length(sampleOffset), sigma);  

            weightedColorSum += color * weight;
            weightedSquaredColorSum += color * color * weight;
            totalWeight += weight;
        }
    }

    // Calculate average color and variance
    avgColor = weightedColorSum / totalWeight;
    vec3 varianceRes = (weightedSquaredColorSum / totalWeight) - (avgColor * avgColor);
    variance = dot(varianceRes, vec3(0.299, 0.587, 0.114)); // Convert to luminance
}

void main() {
    vec3 sectorAvgColors[SECTOR_COUNT];
    float sectorVariances[SECTOR_COUNT];

    for (int i = 0; i < SECTOR_COUNT; i++) {
      float angle = float(i) * 6.28318 / float(SECTOR_COUNT); // 2π / SECTOR_COUNT
      getSectorVarianceAndAverageColor(angle, float(uRadius), sectorAvgColors[i], sectorVariances[i]);
    }

    float minVariance = sectorVariances[0];
    vec3 finalColor = sectorAvgColors[0];

    for (int i = 1; i < SECTOR_COUNT; i++) {
        if (sectorVariances[i] < minVariance) {
            minVariance = sectorVariances[i];
            finalColor = sectorAvgColors[i];
        }
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export const KuwaharaShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRadius: { value: 15 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader,
};
