/** Linear strength tween driven by the app ticker (no GSAP dependency). */
export class StrengthTween {
  strength = 0;
  private from = 0;
  private to = 0;
  private elapsed = 0;
  private duration = 0;
  private active = false;

  start(to: number, duration: number) {
    if (duration <= 0) {
      this.strength = to;
      this.active = false;
      return;
    }
    this.from = this.strength;
    this.to = to;
    this.elapsed = 0;
    this.duration = duration;
    this.active = true;
  }

  update(delta: number) {
    if (!this.active) return;
    this.elapsed += delta;
    const t = Math.min(this.elapsed / this.duration, 1);
    this.strength = this.from + (this.to - this.from) * t;
    if (t >= 1) this.active = false;
  }
}
