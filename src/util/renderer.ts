/**
 * Render into an offscreen target, then restore the default framebuffer.
 * Keeps the set-target / clear / render / unset-target boilerplate in one place.
 */
export function renderToTarget(renderer: any, target: any, fn: () => void) {
  renderer.setRenderTarget(target);
  renderer.clear();
  fn();
  renderer.setRenderTarget(null);
}
