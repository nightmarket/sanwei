import { BufferAttribute, BufferGeometry } from "three";

export const createBigTriangle = () => {
  const triangleGeometry = new BufferGeometry();
  triangleGeometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  triangleGeometry.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return triangleGeometry;
};
