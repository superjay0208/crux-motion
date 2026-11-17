import { mkdir, open, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

export function createRecordingHandler(folder) {
  const sessions = new Map();
  const reply = (res, status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  return async (req, res, pathname) => {
    if (!pathname.startsWith("/api/recordings")) return false;
    const expected = `http://${req.headers.host}`;
    if (
      req.method !== "POST" ||
      req.headers.origin !== expected ||
      !/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(req.headers.host ?? "")
    ) {
      reply(res, 403, {
        error: "Recording saves require a same-origin local request.",
      });
      return true;
    }
    if (pathname === "/api/recordings/start") {
      for (const [key, value] of sessions)
        if (Date.now() - value.created > 3600000) sessions.delete(key);
      if (sessions.size >= 20) {
        reply(res, 429, { error: "Too many unfinished recording saves." });
        return true;
      }
      const id =
        new Date().toISOString().replace(/[:.]/g, "-") +
        "-" +
        randomBytes(4).toString("hex");
      const token = randomBytes(24).toString("hex");
      await mkdir(resolve(folder, id), { recursive: true });
      sessions.set(id, { token, created: Date.now(), done: new Set() });
      reply(res, 201, { id, token });
      return true;
    }
    const match = pathname.match(
      /^\/api\/recordings\/([0-9A-Za-z-]{20,70})\/(video|telemetry)$/,
    );
    const session = match && sessions.get(match[1]);
    if (
      !match ||
      !session ||
      req.headers["x-recording-token"] !== session.token
    ) {
      reply(res, 403, { error: "Unknown recording or token." });
      return true;
    }
    const kind = match[2],
      limit = kind === "video" ? 80 * 1024 * 1024 : 16 * 1024 * 1024;
    if (session.done.has(kind)) {
      reply(res, 409, { error: "This recording part is already saved." });
      return true;
    }
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > limit) {
          reply(res, 413, { error: "Recording part is too large." });
          return true;
        }
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      if (kind === "video") {
        if (
          data.length < 4 ||
          !data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        ) {
          reply(res, 400, { error: "Expected a WebM video." });
          return true;
        }
      } else {
        const parsed = JSON.parse(data.toString("utf8"));
        if (
          parsed.version !== 1 ||
          !Array.isArray(parsed.frames) ||
          !parsed.analysis
        ) {
          reply(res, 400, { error: "Expected recording diagnostics." });
          return true;
        }
      }
      const destination = resolve(
        folder,
        match[1],
        kind === "video" ? "camera-gameplay.webm" : "telemetry.json",
      );
      const file = await open(destination, "wx");
      try {
        await file.writeFile(data);
      } finally {
        await file.close();
      }
      session.done.add(kind);
      const target = resolve(folder, match[1]);
      if (kind === "telemetry") {
        const parsed = JSON.parse(data.toString("utf8"));
        const a = parsed.analysis;
        const findings = (a.findings ?? [])
          .map(
            (f) =>
              `- ${f.title}: ${f.detail} First flagged at ${f.firstTime.toFixed(1)}s; ${f.seconds}s total.`,
          )
          .join("\n");
        await writeFile(
          resolve(target, "analysis.md"),
          `# Recorded play-test diagnostics\n\nScenario: ${parsed.scenario}\nDuration: ${Number(a.duration).toFixed(1)}s\nSamples: ${a.samples}\nActive gameplay: ${a.activeSeconds}s\nCamera frame-age p95: ${Number(a.frameAgeP95).toFixed(0)}ms\nCatches: ${a.catches}; slips: ${a.slips}\n\n${findings || "No threshold-based issue flags. This does not establish correct recognition or good feel."}\n\n${a.limitation}\n\nVideo: camera-gameplay.webm\nTelemetry: telemetry.json\n`,
          { flag: "wx" },
        );
      }
      reply(res, 201, {
        folder: target,
        bytes,
        complete: session.done.size === 2,
      });
      if (session.done.size === 2) sessions.delete(match[1]);
    } catch (e) {
      reply(res, 400, {
        error: e instanceof Error ? e.message : "Could not save recording",
      });
    }
    return true;
  };
}
