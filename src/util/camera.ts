import gsap from "gsap";
import type { PerspectiveCamera, Vector3 } from "three";
import { THREE } from "../three-adapter";

export const transitionTo = (
  from: PerspectiveCamera,
  to: PerspectiveCamera,
  _target?: Vector3
) => {
  // Store the end states of the "to" camera
  const toPos = to.position.clone();
  const toFov = to.fov;
  const toZoom = to.zoom;

  // Get the current lookAt direction of the "to" camera
  const toLookAt = new THREE.Vector3();
  to.getWorldDirection(toLookAt);
  toLookAt.add(to.position);

  // Set the "to" camera to match everything from the "from" camera
  to.position.copy(from.position);
  to.fov = from.fov;
  to.zoom = from.zoom;

  // Get the lookAt direction of the "from" camera
  const fromLookAt = new THREE.Vector3();
  from.getWorldDirection(fromLookAt);
  fromLookAt.add(from.position);
  to.lookAt(fromLookAt);

  to.updateProjectionMatrix();

  // Animate to the stored end states
  gsap.to(
    {},
    {
      duration: 4,
      ease: "power2.out",
      onUpdate: function () {
        const p = this.progress();

        // Lerp position
        to.position.lerpVectors(from.position, toPos, p);

        // Lerp lookAt
        const currentLookAt = new THREE.Vector3();
        currentLookAt.lerpVectors(fromLookAt, toLookAt, p);
        to.lookAt(currentLookAt);

        // Lerp fov and zoom
        to.fov = THREE.MathUtils.lerp(from.fov, toFov, p);
        to.zoom = THREE.MathUtils.lerp(from.zoom, toZoom, p);

        to.updateProjectionMatrix();
      },
    }
  );
};
