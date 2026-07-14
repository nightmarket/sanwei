// GlobalUniforms adapter - allows core modules to work with both WebGL and WebGPU uniforms.
// The actual uniforms are bound by the entry point (sanwei/three or sanwei/three-webgpu).

export interface GlobalUniformsShape {
	uTime: { value: number };
	uScreen: {
		value: { x: number; y: number; set(x: number, y: number): void };
	};
	uBackground: { value: any };
	uPixelRatio: { value: number };
}

let _globalUniforms: GlobalUniformsShape | null = null;

export function bindGlobalUniforms(uniforms: GlobalUniformsShape) {
	_globalUniforms = uniforms;
}

export function getGlobalUniforms(): GlobalUniformsShape {
	if (!_globalUniforms) {
		throw new Error(
			"GlobalUniforms not initialized. Import from '@repo/sanwei/three' or '@repo/sanwei/three-webgpu'.",
		);
	}
	return _globalUniforms;
}

// Proxy that lazily accesses GlobalUniforms - allows top-level usage in core modules
export const GlobalUniforms = new Proxy({} as GlobalUniformsShape, {
	get(_target, prop) {
		return getGlobalUniforms()[prop as keyof GlobalUniformsShape];
	},
});
