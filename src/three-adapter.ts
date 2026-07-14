// THREE adapter - allows core modules to work with both "three" and "three/webgpu"
// The actual THREE module is bound by the entry point (sanwei/three or sanwei/three-webgpu)

type ThreeModule = typeof import("three");

let _THREE: ThreeModule | null = null;

export function bindThree(three: ThreeModule) {
  _THREE = three;
}

export function getThree(): ThreeModule {
  if (!_THREE) {
    throw new Error(
      "THREE has not been initialized. Import from '@repo/sanwei/three' or '@repo/sanwei/three-webgpu' instead of '@repo/sanwei'."
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
