import { add, clamp, sub, v, type V } from "../core/math";

/** View coordinates only. Camera motion never enters the wrist/physics mapping. */
export class FollowCamera {
  center = v();
  scale = 1;
  origin = v();
  private initialized = false;
  reset() {
    this.initialized = false;
  }
  update(
    width: number,
    height: number,
    body: V,
    next: V | undefined,
    dt: number,
  ) {
    // Keep the feet below and one arm's reach above the player, rather than
    // shrinking the entire campaign into view. The next move only nudges the view.
    const desired = add(
      body,
      v(
        next ? clamp((next.x - body.x) * 0.12, -0.12, 0.12) : 0,
        0.38 + (next ? clamp((next.y - body.y - 0.7) * 0.18, 0, 0.18) : 0),
      ),
    );
    const scale = Math.min(width / 3.3, height / 3.2);
    if (!this.initialized) {
      this.center = desired;
      this.scale = scale;
      this.initialized = true;
    } else {
      const delta = sub(desired, this.center),
        alpha = 1 - Math.exp(-4 * clamp(dt, 0, 0.1));
      // A soft dead zone prevents detection jitter from shaking the wall.
      for (const axis of ["x", "y"] as const) {
        const outside = Math.max(0, Math.abs(delta[axis]) - 0.08);
        this.center[axis] += Math.sign(delta[axis]) * outside * alpha;
      }
      this.scale = scale;
    }
    // Keep a fast dyno/fall inside the view even when smoothing is still catching
    // up. Leave room for a full arm sideways and the passive legs below.
    this.center.x = clamp(this.center.x, body.x - 0.45, body.x + 0.45);
    this.center.y = clamp(this.center.y, body.y - 0.6, body.y + 0.5);
    this.origin = v(
      width * 0.5 - this.center.x * this.scale,
      height * 0.5 + this.center.y * this.scale,
    );
  }
  toScreen(p: V) {
    return v(
      this.origin.x + p.x * this.scale,
      this.origin.y - p.y * this.scale,
    );
  }
  toWorld(p: V) {
    return v(
      (p.x - this.origin.x) / this.scale,
      (this.origin.y - p.y) / this.scale,
    );
  }
}
