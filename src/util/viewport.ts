export const getViewportHeight = (
  depth, // include camera offset
  fov
) => {
  // vertical fov in radians
  const vFOV = (fov * Math.PI) / 180;

  // Math.abs to ensure the result is always positive
  return 2 * Math.tan(vFOV / 2) * Math.abs(depth);
};

export const getVisibleDimensionsAtZDepth = (depth, camera, ignoreCameraOffset = false) => {
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
