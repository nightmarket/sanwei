type ViewportCamera = {
  position: { z: number };
  fov: number;
  aspect: number;
};

/** Visible height at a given camera depth (depth includes camera offset). */
export const getViewportHeight = (depth: number, fov: number) => {
  const vFOV = (fov * Math.PI) / 180;
  return 2 * Math.tan(vFOV / 2) * Math.abs(depth);
};

export const getVisibleDimensionsAtZDepth = (
  depth: number,
  camera: ViewportCamera,
  ignoreCameraOffset = false
) => {
  const relativeDepth = depth - (ignoreCameraOffset ? 0 : camera.position.z);

  if (relativeDepth === 0) {
    throw new Error("Depth cannot be 0");
  }

  const visibleHeight = getViewportHeight(relativeDepth, camera.fov);
  const visibleWidth = visibleHeight * camera.aspect;

  return {
    visibleHeight,
    visibleWidth,
  };
};
