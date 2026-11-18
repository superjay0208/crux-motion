// GPU/CPU lifecycle adapted from abouchedidxcode/open-source-hands tracker.ts
// at dd79fb7b3a9d2e9868e433611e6b8737dfca3936 (MIT; public/licenses).
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  HolisticLandmarker,
} from "@mediapipe/tasks-vision";
export const HAND_LANDMARKER_CONFIDENCE = {
  minHandDetectionConfidence: 0.45,
  minHandPresenceConfidence: 0.45,
  minTrackingConfidence: 0.45,
} as const;
type RawLandmark = { x: number; y: number; z?: number; visibility?: number };
export function normalizeHolisticResult<
  P extends RawLandmark = RawLandmark,
  W extends RawLandmark = RawLandmark,
>(r: {
  poseLandmarks?: P[][];
  leftHandLandmarks?: P[][];
  leftHandWorldLandmarks?: W[][];
  rightHandLandmarks?: P[][];
  rightHandWorldLandmarks?: W[][];
}) {
  return {
    pose: r.poseLandmarks?.[0] ?? [],
    detections: [
      {
        points: r.leftHandLandmarks?.[0] ?? [],
        world: r.leftHandWorldLandmarks?.[0],
        label: "Left",
        score: 1,
      },
      {
        points: r.rightHandLandmarks?.[0] ?? [],
        world: r.rightHandWorldLandmarks?.[0],
        label: "Right",
        score: 1,
      },
    ].filter((d) => d.points.length === 21),
  };
}
let hand: HandLandmarker | undefined,
  pose: PoseLandmarker | undefined,
  holistic: HolisticLandmarker | undefined;
const scope = (typeof self !== "undefined" ? self : null) as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown) => void;
} | null;
let selectedDelegate: "CPU" | "GPU" = "CPU";
let initData: any;
let failures = 0;
function closeTasks() {
  hand?.close();
  pose?.close();
  holistic?.close();
  hand = undefined;
  pose = undefined;
  holistic = undefined;
}
async function initialize(data: any, cpuOnly = false) {
  closeTasks();
  const files = await FilesetResolver.forVisionTasks(`${data.base}wasm`);
  const create = async (delegate: "CPU" | "GPU") => {
    const baseOptions = (file: string) => ({
      modelAssetPath: `${data.base}models/${file}.task`,
      delegate,
    });
    if (data.provider === "holistic")
      holistic = await HolisticLandmarker.createFromOptions(files, {
        baseOptions: baseOptions("holistic"),
        runningMode: "VIDEO",
        outputFaceBlendshapes: false,
        outputPoseSegmentationMasks: false,
      });
    else {
      pose = await PoseLandmarker.createFromOptions(files, {
        baseOptions: baseOptions("pose"),
        runningMode: "VIDEO",
        numPoses: 1,
        outputSegmentationMasks: false,
      });
      hand = await HandLandmarker.createFromOptions(files, {
        baseOptions: baseOptions("hand"),
        runningMode: "VIDEO",
        numHands: 2,
        ...HAND_LANDMARKER_CONFIDENCE,
      });
    }
    selectedDelegate = delegate;
  };
  // Adapted from open-source-hands tracker.ts's GPU-first / CPU fallback lifecycle.
  if (
    !cpuOnly &&
    data.delegate !== "CPU" &&
    typeof OffscreenCanvas !== "undefined"
  ) {
    try {
      await create("GPU");
      return;
    } catch {
      closeTasks();
    }
  }
  await create("CPU");
}
if (scope) {
  scope.onmessage = async ({ data }) => {
    try {
      if (data.kind === "init") {
        initData = data;
        failures = 0;
        await initialize(data);
        scope.postMessage({ kind: "ready", delegate: selectedDelegate });
        return;
      }
      if (data.kind === "frame") {
        const start = performance.now();
        let result;
        try {
          if (holistic) {
            result = normalizeHolisticResult(
              holistic.detectForVideo(data.frame, data.t),
            );
          } else {
            const p = pose!.detectForVideo(data.frame, data.t),
              h = hand!.detectForVideo(data.frame, data.t);
            result = {
              pose: p.landmarks[0] || [],
              detections: h.landmarks.map((points, i) => ({
                points,
                world: h.worldLandmarks[i],
                label: h.handedness[i]?.[0]?.categoryName || "",
                score: h.handedness[i]?.[0]?.score || 0,
              })),
            };
          }
          failures = 0;
        } catch (error) {
          failures++;
          if (selectedDelegate === "GPU") {
            if (failures >= 3) {
              await initialize(initData, true);
              scope.postMessage({ kind: "ready", delegate: selectedDelegate });
            }
            scope.postMessage({ kind: "skipped" });
            return;
          }
          throw error;
        } finally {
          data.frame.close();
        }
        scope.postMessage({
          kind: "result",
          ...result,
          t: data.t,
          width: data.width,
          height: data.height,
          inferenceMs: performance.now() - start,
          sequence: data.sequence,
        });
      }
    } catch (error) {
      scope.postMessage({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
