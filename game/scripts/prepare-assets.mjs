import { mkdir, cp, writeFile, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("public/models", { recursive: true });
await mkdir("public/notices", { recursive: true });
await cp(
  "node_modules/planck/LICENSE.txt",
  "public/notices/planck-license.txt",
);
try {
  await stat("public/notices/mediapipe-license.txt");
} catch {
  const license = await fetch(
    "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE",
  );
  if (!license.ok) throw new Error("Could not download MediaPipe license");
  await writeFile("public/notices/mediapipe-license.txt", await license.text());
}
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", {
  recursive: true,
});
const assets = {
  "hand.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "pose.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "holistic.task":
    "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task",
};
const manifest = {
  package: "@mediapipe/tasks-vision",
  version: "0.10.32",
  assets: [],
};
for (const [name, url] of Object.entries(assets)) {
  const path = `public/models/${name}`;
  let size = await stat(path)
    .then((s) => s.size)
    .catch(() => 0);
  if (!size) {
    console.log(`Downloading ${name}`);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    await writeFile(path, new Uint8Array(await r.arrayBuffer()));
  }
  const data = await readFile(path);
  manifest.assets.push({
    name,
    url,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
await writeFile(
  "public/models/manifest.json",
  JSON.stringify(manifest, null, 2),
);
console.log("Prepared pinned local models and WASM.");
