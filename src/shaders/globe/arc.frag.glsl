uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uGlowWidth;

varying vec2 vUv;
varying float vProgress;

void main() {
    // Calculate the animated position with slower speed
    float t = mod(uTime * 0.2, 1.0);
    
    // Create a smooth glow effect
    float glow = smoothstep(t - 0.1, t, vProgress) * 
                 smoothstep(t + 0.1, t, vProgress);
    
    // Add some falloff at the edges
    float falloff = smoothstep(0.0, 0.1, vProgress) * 
                   smoothstep(1.0, 0.9, vProgress);
    
    // Combine the effects
    vec3 color = uColor * glow * falloff;
    
    // Add some alpha for the glow
    float alpha = glow * falloff;
    
    gl_FragColor = vec4(color, alpha);
    gl_FragColor = vec4(uColor, 1.0);
} 