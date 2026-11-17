import { build } from "esbuild";
// MediaPipe 0.10.32 loads its WASM glue with importScripts. A classic IIFE
// worker is required; module workers reject importScripts in Chromium.
await build({
  entryPoints: ["src/tracking/inference.worker.ts"],
  outfile: "public/tracking.worker.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
