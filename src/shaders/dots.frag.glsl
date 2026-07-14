varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform sampler2D tDiffuse;

#pragma glslify: snoise3 = require(glsl-noise/simplex/3d) 

float circleSDF(vec2 p, float r) {

    return length(p - 0.5) - r;
}


void main() {
    vec4 color = texture2D(tDiffuse, vUv);

    vec2 normalizedPixelSize = uPixelSize / uResolution;
    vec2 pixelatedUv = normalizedPixelSize * floor(vUv / normalizedPixelSize);

    vec2 cellUv = fract(vUv / normalizedPixelSize);

    vec4 pixelatedColor = texture2D(tDiffuse, pixelatedUv);

    float n = snoise3(vec3(pixelatedUv * 50., uTime * .4));
    float r = 0.2 + 0.3 * abs(sin(uTime * .2)) * n;






    // color = texture2D(tDiffuse, pixelatedUv);
    // color = vec4(cellUv, 0.0, 1.0);

    color = pixelatedColor * (1. - smoothstep(0.0, 0.1, circleSDF(cellUv, r)));

    gl_FragColor = color;
}