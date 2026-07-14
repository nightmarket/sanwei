import { THREE } from "../three-adapter";

export const createBigTriangle = () => {
  const triangleGeometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
  triangleGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

  const uvs = new Float32Array([0, 0, 2, 0, 0, 2]);
  triangleGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  return triangleGeometry;
};
