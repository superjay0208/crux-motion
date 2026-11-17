export type V = { x: number; y: number };
export const v = (x = 0, y = 0): V => ({ x, y });
export const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y);
export const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y);
export const mul = (a: V, s: number): V => v(a.x * s, a.y * s);
export const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
export const len = (a: V) => Math.hypot(a.x, a.y);
export const dist = (a: V, b: V) => len(sub(a, b));
export const clamp = (x: number, a: number, b: number) =>
  Math.max(a, Math.min(b, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const rotate = (p: V, a: number): V =>
  v(
    p.x * Math.cos(a) - p.y * Math.sin(a),
    p.x * Math.sin(a) + p.y * Math.cos(a),
  );
export function closest(p: V, a: V, b: V): V {
  const d = sub(b, a);
  return add(a, mul(d, clamp(dot(sub(p, a), d) / (dot(d, d) || 1), 0, 1)));
}
export function ik(
  shoulder: V,
  target: V,
  upper = 0.36,
  lower = 0.39,
  bend = 1,
) {
  const delta = sub(target, shoulder),
    d = clamp(
      len(delta),
      Math.abs(upper - lower) + 0.005,
      upper + lower - 0.005,
    );
  const base = Math.atan2(delta.y, delta.x),
    e =
      bend *
      Math.acos(
        clamp(
          (d * d - upper * upper - lower * lower) / (2 * upper * lower),
          -1,
          1,
        ),
      );
  const a = base - Math.atan2(lower * Math.sin(e), upper + lower * Math.cos(e));
  return {
    upper: a,
    elbow: e,
    point: add(shoulder, v(Math.cos(a) * upper, Math.sin(a) * upper)),
  };
}
