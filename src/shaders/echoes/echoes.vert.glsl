varying vec3 vNormal;

uniform float uTriangleScale;
uniform float uTime;
uniform float uVoxelSize;
attribute vec3 aCenter;

#pragma glslify: cnoise4 = require(glsl-noise/classic/4d) 
#pragma glslify: rotate = require(glsl-rotate/rotate)

const float PI = 3.14159265358979323846;    

void main() {
    vNormal = normal;

    vec3 pos = position;


    pos = (pos - aCenter) * uTriangleScale + aCenter;



    pos = floor(pos / uVoxelSize) * uVoxelSize;

    float noise = cnoise4(vec4(pos, uTime * .5));
    
    float theta = noise * PI * .01;
    pos += rotate(pos, vec3(1., 0., 0.), theta);
    pos += rotate(pos, vec3(0., 1., 0.), theta);
    pos += rotate(pos, vec3(0., 1., 1.), theta);


    // float scale = 1. + noise;
    // pos *= scale;

    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
}