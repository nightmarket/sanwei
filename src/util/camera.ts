import gsap from "gsap";
import { MathUtils, type PerspectiveCamera, Vector3 } from "three";

/** Animate `to` from `from`'s current pose back to its own pose (position, look direction, fov, zoom). */
export const transitionTo = (from: PerspectiveCamera, to: PerspectiveCamera) => {
  const toPos = to.position.clone();
  const toFov = to.fov;
  const toZoom = to.zoom;
  const toLookAt = to.getWorldDirection(new Vector3()).add(to.position);

  const fromLookAt = from.getWorldDirection(new Vector3()).add(from.position);
  to.position.copy(from.position);
  to.fov = from.fov;
  to.zoom = from.zoom;
  to.lookAt(fromLookAt);
  to.updateProjectionMatrix();

  const lookAt = new Vector3();
  gsap.to(
    {},
    {
      duration: 4,
      ease: "power2.out",
      onUpdate: function () {
        const p = this.progress();
        to.position.lerpVectors(from.position, toPos, p);
        to.lookAt(lookAt.lerpVectors(fromLookAt, toLookAt, p));
        to.fov = MathUtils.lerp(from.fov, toFov, p);
        to.zoom = MathUtils.lerp(from.zoom, toZoom, p);
        to.updateProjectionMatrix();
      },
    }
  );
};
