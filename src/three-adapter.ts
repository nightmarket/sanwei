// THREE adapter — core modules work with both "three" and "three/webgpu".
// Bound by @nightmarket/sanwei/three or @nightmarket/sanwei/three-webgpu.

type ThreeModule = typeof import("three");

let _THREE: ThreeModule | null = null;

export function bindThree(three: ThreeModule) {
  _THREE = three;
}

export function getThree(): ThreeModule {
  if (!_THREE) {
    throw new Error(
      "THREE has not been initialized. Import from '@nightmarket/sanwei/three' or '@nightmarket/sanwei/three-webgpu' instead of '@nightmarket/sanwei'."
    );
  }
  return _THREE;
}

// Proxy that lazily accesses THREE - allows top-level usage in modules
export const THREE = new Proxy({} as ThreeModule, {
  get(_target, prop) {
    return getThree()[prop as keyof ThreeModule];
  },
});
