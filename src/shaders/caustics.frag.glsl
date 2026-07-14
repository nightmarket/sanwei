uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;

#define F a=min(a,length(.5-fract(color.xyw*=mat3(-2,-1,2, 3,-2,1, 1,2,2)*.3)))

void main() {
    vec2 p = vUv * 1000.;
    // vec2 p = gl_FragCoord.xy;
    vec4 color = vec4(0.);


    color.xy = p/uResolution.y*7. + sin(color = vec4(uTime*.2)).w;
    float a=1.;
    F;F;F;
    color = pow(a,7.)*25.+vec4(0,.35,.5,1);

    gl_FragColor = color;
}