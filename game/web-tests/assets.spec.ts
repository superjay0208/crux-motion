import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { validateReplay } from "../src/core/replay";
test("production document, bundled JavaScript and styles resolve", async ({
  request,
}) => {
  const r = await request.get("/");
  expect(r.ok()).toBeTruthy();
  const html = await r.text();
  expect(html).toContain("Crux Motion");
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    (m) => m[1],
  );
  expect(assets.length).toBeGreaterThan(1);
  for (const path of assets) {
    const a = await request.get(new URL(path, r.url()).href);
    expect(a.ok()).toBeTruthy();
    expect(a.headers()["content-type"]).toContain(
      path.endsWith(".css") ? "text/css" : "javascript",
    );
    if (path.endsWith(".css"))
      for (const font of (await a.text()).matchAll(/url\(([^)]+\.ttf)\)/g)) {
        const f = await request.get(
          new URL(font[1].replaceAll('"', "").replaceAll("'", ""), a.url())
            .href,
        );
        expect(f.ok()).toBeTruthy();
        expect(f.headers()["content-type"]).toContain("font/ttf");
        const bytes = await f.body();
        expect([...bytes.subarray(0, 4)]).toEqual([0, 1, 0, 0]);
        expect(bytes.length).toBeGreaterThan(10000);
      }
  }
});
test("all pinned model assets match their recorded hashes", async ({
  request,
}) => {
  const manifest = await (await request.get("/models/manifest.json")).json();
  expect(manifest.version).toBe("0.10.32");
  for (const a of manifest.assets) {
    const r = await request.get("/models/" + a.name);
    expect(r.ok()).toBeTruthy();
    const body = await r.body();
    expect(body.length).toBe(a.bytes);
    expect(createHash("sha256").update(body).digest("hex")).toBe(a.sha256);
  }
});
test("SIMD and fallback WASM are binary WebAssembly", async ({ request }) => {
  for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
    const r = await request.get("/wasm/" + name + ".wasm");
    expect(r.ok()).toBeTruthy();
    expect([...(await r.body()).subarray(0, 4)]).toEqual([0, 97, 115, 109]);
    expect((await request.get("/wasm/" + name + ".js")).ok()).toBeTruthy();
  }
});
test("all twelve demonstration recordings are valid semantic inputs", async ({
  request,
}) => {
  for (let i = 1; i <= 12; i++) {
    const id = `motion-${String(i).padStart(2, "0")}`,
      r = await request.get(`/solutions/${id}.json`);
    expect(r.ok()).toBeTruthy();
    const replay = validateReplay(await r.json());
    expect(replay.controller).toBe("anchors");
    expect(replay.route).toBe(id);
    expect(replay.frames.length).toBeGreaterThan(10);
  }
});
test("redistribution notices for all imported control components ship", async ({
  request,
}) => {
  for (const [file, notice] of [
    ["GorillaLocomotion-MIT.txt", "Another-Axiom"],
    ["Godot-XR-Tools-MIT.txt", "MIT"],
    ["Open-Source-Hands-MIT.txt", "MIT"],
    ["OneEuroFilter-BSD.txt", "Copyright 2019 Inria"],
  ]) {
    const r = await request.get("/licenses/" + file);
    expect(r.ok()).toBe(true);
    expect(await r.text()).toContain(notice);
  }
});
test("classic inference worker and build provenance ship", async ({
  request,
}) => {
  const r = await request.get("/tracking.worker.js");
  expect(r.ok()).toBeTruthy();
  expect((await r.text()).length).toBeGreaterThan(50000);
  const build = await (await request.get("/build-info.json")).json();
  expect(build.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  expect((await request.get("/diagnostics.html")).ok()).toBeTruthy();
});
test("personal recording storage rejects foreign writes and direct reads", async ({
  request,
}) => {
  expect((await request.get("/api/recordings/private/video")).status()).toBe(
    403,
  );
  const denied = await request.post("/api/recordings/start", {
    headers: { Origin: "https://example.com" },
  });
  expect(denied.status()).toBe(403);
});
