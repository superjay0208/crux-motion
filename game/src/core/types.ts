import type { V } from "./math";
export type Hand = "left" | "right";
export const hands: Hand[] = ["left", "right"];
export type Grip = "jug" | "crimp" | "sloper" | "pinch" | "release" | "unknown";
export const gripFits = (grip: Grip, hold: Hold["kind"]) =>
  grip === hold || (hold === "jug" && grip === "crimp");
export type Orientation = "up" | "down" | "side";
export type ArmPose = { upper: number; elbow: number };
export type ArmMotion = ArmPose & {
  upperVelocity: number;
  elbowVelocity: number;
};
export type Intent = {
  target: V;
  grip: Grip;
  ready: boolean;
  orientation: Orientation;
  quality: boolean;
  bend: number;
  /** Camera-plane upper-arm direction and relative elbow bend, retargeted from tracked motion. */
  arm?: ArmMotion;
};
export type Inputs = Record<Hand, Intent>;
export type Hold = {
  id: string;
  p: V;
  kind: Exclude<Grip, "release" | "unknown">;
  direction: V;
  radius: number;
  match?: boolean;
  finish?: boolean;
  checkpoint?: boolean;
  label?: string;
};
export type Route = {
  id: string;
  name: string;
  subtitle: string;
  hint: string;
  difficulty: string;
  holds: Hold[];
  start: [string, string];
  goal: "none" | "cross" | "flight" | "undercling";
  theme: string;
  fallY: number;
};
export type EventKind =
  | "catch"
  | "release"
  | "slip"
  | "launch"
  | "finish"
  | "fall"
  | "checkpoint";
export type SimEvent = {
  id: number;
  tick: number;
  kind: EventKind;
  p: V;
  hand?: Hand;
  power: number;
  message: string;
};
export type Replay = {
  version: 1;
  route: string;
  mode: string;
  controller?: "anchors" | "motors";
  frames: { tick: number; input: Inputs }[];
  duration: number;
};
export const initialInputs = (): Inputs => ({
  left: {
    target: { x: -0.12, y: 0.6 },
    grip: "jug",
    ready: true,
    orientation: "up",
    quality: true,
    bend: -1,
  },
  right: {
    target: { x: 0.12, y: 0.6 },
    grip: "jug",
    ready: true,
    orientation: "up",
    quality: true,
    bend: 1,
  },
});
