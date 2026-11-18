// Production /crux-motion/ subpath & live GitHub Pages validator + 60 FPS performance gate.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const gameDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const distDir = path.join(gameDir, "dist");
const validationDir = path.join(repoRoot, "validation");
const screenshotsDir = path.join(validationDir, "screenshots");

const urlArg = process.argv.find((v) => v.startsWith("--url="));
const isLive = Boolean(urlArg);
const isCI = Boolean(process.env.CI || process.env.CRUX_CI === "1");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".task": "application/octet-stream",
};

let server = null;
let baseUrl = urlArg ? urlArg.slice("--url=".length) : "";
if (baseUrl && !baseUrl.endsWith("/")) baseUrl += "/";

if (!isLive) {
  server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(parsed.pathname);
      if (pathname === "/crux-motion") {
        res.writeHead(301, { Location: `/crux-motion/${parsed.search}` });
        res.end();
        return;
      }
      if (!pathname.startsWith("/crux-motion/")) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found outside /crux-motion/");
        return;
      }
      const relPath = pathname.slice("/crux-motion/".length) || "index.html";
      let filePath = path.resolve(distDir, relPath);
      if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat?.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Content-Length": data.length,
        "Cache-Control": "no-cache",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/crux-motion/`;
}

const allowedHostname = new URL(baseUrl).hostname;

const round2 = (n) => Math.round(n * 100) / 100;
const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
};

async function measureFrames(page, frameCount = 180) {
  const raw = await page.evaluate(async (targetFrames) => {
    const perfState = window.__cruxPerf;
    perfState.frameWorkMs = [];
    perfState.active = true;

    const longTasks = [];
    let observer = null;
    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask")
    ) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(entry.duration);
        }
      });
      observer.observe({ type: "longtask", buffered: false });
    }

    const deltas = [];
    let prevTick = window.cruxMotion?.snapshot?.tick ?? 0;
    let totalTicksAdvanced = 0;
    const wallStart = performance.now();

    await new Promise((resolve) => {
      let prev = null;
      let count = 0;
      const step = (ts) => {
        const curTick = window.cruxMotion?.snapshot?.tick ?? 0;
        if (curTick > prevTick) {
          totalTicksAdvanced += curTick - prevTick;
        }
        prevTick = curTick;
        if (prev !== null) {
          deltas.push(ts - prev);
          count++;
          if (count >= targetFrames) {
            resolve();
            return;
          }
        }
        prev = ts;
        perfState.origRAF(step);
      };
      perfState.origRAF(step);
    });

    const elapsedMs = performance.now() - wallStart;
    perfState.active = false;
    if (observer) observer.disconnect();

    return {
      frames: deltas.length,
      elapsedMs,
      simTicksAdvanced: totalTicksAdvanced,
      deltas,
      frameWorkMs: perfState.frameWorkMs.slice(),
      longTasks,
    };
  }, frameCount);

  const sortedDeltas = [...raw.deltas].sort((a, b) => a - b);
  const sortedWork = [...raw.frameWorkMs].sort((a, b) => a - b);
  const workMean = sortedWork.length
    ? sortedWork.reduce((acc, v) => acc + v, 0) / sortedWork.length
    : 0;

  return {
    frames: raw.frames,
    elapsedMs: round2(raw.elapsedMs),
    simTicksAdvanced: raw.simTicksAdvanced,
    fps: round2((raw.frames * 1000) / Math.max(1, raw.elapsedMs)),
    frameDeltaP50Ms: round2(percentile(sortedDeltas, 50)),
    frameDeltaP95Ms: round2(percentile(sortedDeltas, 95)),
    frameDeltaMaxMs: round2(sortedDeltas[sortedDeltas.length - 1] ?? 0),
    frameWorkMeanMs: round2(workMean),
    frameWorkP50Ms: round2(percentile(sortedWork, 50)),
    frameWorkP95Ms: round2(percentile(sortedWork, 95)),
    longTasksCount: raw.longTasks.length,
    longTasksMaxMs: round2(
      raw.longTasks.length ? Math.max(...raw.longTasks) : 0,
    ),
  };
}

function assertPerfGate(label, stats) {
  const minFps = isCI ? 25 : 45;
  const maxDeltaP95 = isCI ? 65 : 34;
  const maxWorkP95 = isCI ? 25 : 16;

  if (stats.simTicksAdvanced <= 20) {
    throw new Error(
      `${label}: physics simulation ticks did not advance sufficiently (${stats.simTicksAdvanced}).`,
    );
  }
  if (stats.fps < minFps) {
    throw new Error(`${label}: FPS ${stats.fps} below minimum gate ${minFps}.`);
  }
  if (stats.frameDeltaP95Ms > maxDeltaP95) {
    throw new Error(
      `${label}: frameDeltaP95Ms ${stats.frameDeltaP95Ms}ms exceeded ${maxDeltaP95}ms gate.`,
    );
  }
  if (stats.frameWorkP95Ms > maxWorkP95) {
    throw new Error(
      `${label}: frameWorkP95Ms ${stats.frameWorkP95Ms}ms exceeded ${maxWorkP95}ms gate.`,
    );
  }
}

await fs.mkdir(screenshotsDir, { recursive: true });

const browser = await chromium.launch({
  channel: isCI ? undefined : "msedge",
});

try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "no-preference",
  });

  await context.addInitScript(() => {
    const origRAF = window.requestAnimationFrame.bind(window);
    window.__cruxPerf = {
      active: false,
      frameWorkMs: [],
      origRAF,
    };
    window.requestAnimationFrame = (cb) =>
      origRAF((ts) => {
        if (!window.__cruxPerf.active) return cb(ts);
        const t0 = performance.now();
        try {
          return cb(ts);
        } finally {
          window.__cruxPerf.frameWorkMs.push(performance.now() - t0);
        }
      });

    window.__workerDelegates = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(scriptURL, options) {
        super(scriptURL, options);
        this.addEventListener("message", (ev) => {
          if (ev.data?.kind === "ready" && typeof ev.data.delegate === "string") {
            window.__workerDelegates.push(ev.data.delegate);
          }
        });
      }
    };
  });

  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const externalRequests = [];
  let capturingLandingAssets = true;
  const landingResponses = [];

  page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("request", (req) => {
    const raw = req.url();
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) return;
    const { hostname } = new URL(raw);
    if (hostname !== allowedHostname) {
      externalRequests.push(raw);
    }
  });
  page.on("response", async (res) => {
    const status = res.status();
    const resUrl = res.url();
    if (status >= 400) {
      httpErrors.push({ status, url: resUrl });
    }
    if (capturingLandingAssets && resUrl.startsWith("http")) {
      let bytes = Number(res.headers()["content-length"] || 0);
      if (!bytes && status >= 200 && status < 300) {
        try {
          bytes = (await res.body()).length;
        } catch {
          bytes = 0;
        }
      }
      landingResponses.push({
        url: resUrl,
        status,
        contentType: res.headers()["content-type"] || "",
        bytes,
      });
    }
  });

  const assertRuntimeClean = (phase) => {
    if (
      pageErrors.length ||
      consoleErrors.length ||
      httpErrors.length ||
      externalRequests.length
    ) {
      throw new Error(
        `Runtime guard failed during ${phase}: ` +
          JSON.stringify({
            pageErrors,
            consoleErrors,
            httpErrors,
            externalRequests,
          }),
      );
    }
  };

  // 1. Initial Landing Load, Fonts, Asset Budget & Autonomous Intro Showcase
  await page.goto(baseUrl, { waitUntil: "load" });
  const fontsCheck = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "Fredoka"'),
      document.fonts.load('16px "Bebas Neue"'),
      document.fonts.load('16px "Display"'),
    ]);
    await document.fonts.ready;
    return {
      fredoka: document.fonts.check('16px "Fredoka"'),
      bebasNeue: document.fonts.check('16px "Bebas Neue"'),
      display: document.fonts.check('16px "Display"'),
    };
  });
  if (!fontsCheck.fredoka || !fontsCheck.bebasNeue || !fontsCheck.display) {
    throw new Error(
      `Self-hosted fonts failed to load: ${JSON.stringify(fontsCheck)}`,
    );
  }
  const fontLoaded = true;

  await page.locator("#intro").waitFor({ state: "visible" });
  await page.locator("#practice-start").waitFor({ state: "visible" });
  await page.locator("#camera-start").waitFor({ state: "visible" });
  const introRouteCount = await page
    .locator("#front-boulder-grid [data-intro-route]")
    .count();
  if (introRouteCount !== 12) {
    throw new Error(
      `Expected 12 open boulder cards on landing (#front-boulder-grid [data-intro-route]), got ${introRouteCount}.`,
    );
  }

  // Wait for live intro showcase simulation ticks to advance
  await page.waitForFunction(
    () => (window.cruxMotion?.snapshot?.tick ?? 0) >= 15,
    null,
    { timeout: 10000 },
  );

  capturingLandingAssets = false;

  const heavyOnLanding = landingResponses.filter((r) =>
    /\.(?:task|wasm)(?:\?|$)/i.test(r.url),
  );
  if (heavyOnLanding.length > 0) {
    throw new Error(
      `Heavy camera model/WASM assets fetched eagerly on landing: ${heavyOnLanding.map((r) => r.url).join(", ")}`,
    );
  }

  const navMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const resources = performance.getEntriesByType("resource");
    const perfTransfer =
      (nav?.transferSize || nav?.encodedBodySize || 0) +
      resources.reduce(
        (sum, r) => sum + (r.transferSize || r.encodedBodySize || 0),
        0,
      );
    return {
      domContentLoadedMs: nav
        ? Math.round((nav.domContentLoadedEventEnd - nav.startTime) * 100) / 100
        : null,
      loadEventMs: nav
        ? Math.round((nav.loadEventEnd - nav.startTime) * 100) / 100
        : null,
      fcpMs: fcp ? Math.round(fcp.startTime * 100) / 100 : null,
      perfTransferBytes: perfTransfer,
      wallDemoTickAttr:
        document.querySelector("#wall")?.getAttribute("data-demo-tick") ?? null,
      wallCaption:
        document.querySelector("#wall-caption")?.textContent?.trim() ?? "",
    };
  });

  const responseBytes = landingResponses.reduce((s, r) => s + r.bytes, 0);
  const transferBytes = navMetrics.perfTransferBytes || responseBytes;

  if (isLive) {
    await page.screenshot({
      path: path.join(screenshotsDir, "live-crux-motion.jpg"),
      type: "jpeg",
      quality: 90,
    });
  }

  // Verify subpath solutions JSON directly
  const solutionCheck = await page.evaluate(async (u) => {
    const res = await fetch(u);
    const json = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      route: json.route,
      controller: json.controller,
      frames: Array.isArray(json.frames) ? json.frames.length : 0,
    };
  }, new URL("solutions/motion-01.json", baseUrl).href);
  if (
    !solutionCheck.ok ||
    solutionCheck.route !== "motion-01" ||
    solutionCheck.frames <= 10
  ) {
    throw new Error(
      `Subpath solution check failed: ${JSON.stringify(solutionCheck)}`,
    );
  }

  // 2. 60 FPS Frame-Time Gate: Intro Showcase (180 frames)
  const introPerf = await measureFrames(page, 180);
  assertPerfGate("Intro showcase 180-frame gate", introPerf);
  assertRuntimeClean("landing + intro showcase");

  // 3. Gameplay, Practice 180-frame Perf Gate, Watch Beta & Persistence Across Reload
  await page.locator("#practice-start").click();
  await page.locator("#play-panel").waitFor({ state: "visible" });
  await page.locator("#stamina-panel").waitFor({ state: "visible" });
  await page.locator("#resume").waitFor({ state: "visible" });
  await page.locator("#resume").click();
  await page.locator("#wall").focus();

  // Drive active live physics simulation (pull + sway) across all 180 frames
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    () =>
      window.cruxMotion?.snapshot?.state === "playing" &&
      (window.cruxMotion?.snapshot?.tick ?? 0) > 10,
    null,
    { timeout: 5000 },
  );
  const practicePerf = await measureFrames(page, 180);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyW");
  assertPerfGate("Practice active climb 180-frame gate", practicePerf);

  // Verify #watch-beta plays shipped solution replay in ATTEMPT REVIEW
  await page.locator("#watch-beta").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#session-mode")?.textContent ===
        "ATTEMPT REVIEW" && (window.cruxMotion?.snapshot?.tick ?? 0) >= 15,
    null,
    { timeout: 10000 },
  );

  // Verify #routes-button switches route to Campus Rungs (index 1)
  await page.locator("#routes-button").click();
  await page.locator('#modal[open] [data-route="1"]').click();
  const switchedRoute = await page.evaluate(() => ({
    index: window.cruxMotion.route,
    name: document.querySelector("#route-name")?.textContent ?? "",
  }));
  if (switchedRoute.index !== 1 || switchedRoute.name !== "Campus Rungs") {
    throw new Error(
      `Route selection failed: ${JSON.stringify(switchedRoute)}`,
    );
  }

  // Toggle #assisted-toggle On -> reload -> verify persistence -> restore Off
  await page.locator("#settings-button").click();
  await page.locator("#assisted-toggle").waitFor({ state: "visible" });
  const beforeAssisted = await page.evaluate(() => window.cruxMotion.assisted);
  if (!beforeAssisted) {
    await page.locator("#assisted-toggle").click();
  }
  if (!(await page.evaluate(() => window.cruxMotion.assisted))) {
    throw new Error("Failed to enable #assisted-toggle.");
  }
  await page.locator("#modal-close").click();

  await page.reload({ waitUntil: "load" });
  await page.locator("#practice-start").click();
  const persistedAssisted = await page.evaluate(() => ({
    assisted: window.cruxMotion.assisted,
    sessionText: document.querySelector("#session-mode")?.textContent ?? "",
  }));
  if (
    !persistedAssisted.assisted ||
    !persistedAssisted.sessionText.includes("ASSISTED")
  ) {
    throw new Error(
      `Assisted mode did not persist across reload: ${JSON.stringify(persistedAssisted)}`,
    );
  }

  // Restore #assisted-toggle Off cleanly
  await page.locator("#settings-button").click();
  await page.locator("#assisted-toggle").click();
  await page.locator("#modal-close").click();
  assertRuntimeClean("gameplay + persistence");

  // 4. Deep-link check: ?route=motion-09
  const deepLinkUrl = `${baseUrl}?route=motion-09`;
  await page.goto(deepLinkUrl, { waitUntil: "load" });
  await page.locator("#intro").waitFor({ state: "visible" });
  const deepLinkIntroRoute = await page.evaluate(() => window.cruxMotion.route);
  await page.locator("#practice-start").click();
  const deepLinkPractice = await page.evaluate(() => ({
    route: window.cruxMotion.route,
    routeName: document.querySelector("#route-name")?.textContent ?? "",
  }));
  if (
    deepLinkIntroRoute !== 8 ||
    deepLinkPractice.route !== 8 ||
    deepLinkPractice.routeName !== "Split Decision"
  ) {
    throw new Error(
      `Deep-link ?route=motion-09 failed: introRoute=${deepLinkIntroRoute}, practice=${JSON.stringify(deepLinkPractice)}`,
    );
  }
  assertRuntimeClean("deep-link ?route=motion-09");

  // 5. Subpath /diagnostics.html check (paired + holistic worker execution)
  const diagnosticsUrl = new URL("diagnostics.html", baseUrl).href;
  await page.goto(diagnosticsUrl, { waitUntil: "load" });
  await page.locator("#run").waitFor({ state: "visible" });
  await page.locator("#run").click();
  await page.waitForSelector('#result[data-complete="true"]', {
    timeout: 60000,
  });

  const diagRaw = (await page.locator("#result").textContent()) || "{}";
  const delegates = await page.evaluate(() => window.__workerDelegates || []);
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const diagParsed = JSON.parse(diagRaw);
  const diagReports = (diagParsed.reports || []).map((r, idx) => {
    const steady = Array.isArray(r.inferenceMs) ? r.inferenceMs.slice(1) : [];
    const steadyMean = steady.length
      ? round2(steady.reduce((a, b) => a + b, 0) / steady.length)
      : null;
    return {
      ...r,
      delegate: delegates[idx] || "CPU",
      steadyStateMeanMs: steadyMean,
    };
  });
  const byProvider = Object.fromEntries(
    diagReports.map((r) => [r.provider, r]),
  );
  if (!byProvider.paired?.pass || !byProvider.holistic?.pass) {
    throw new Error(
      `Diagnostics worker check failed: ${JSON.stringify(diagReports)}`,
    );
  }
  assertRuntimeClean("diagnostics worker check");

  const report = {
    url: baseUrl,
    mode: isLive ? "live" : "subpath",
    recordedAt: new Date().toISOString(),
    browser: userAgent,
    runtimeHygiene: {
      pageErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
      httpErrors: httpErrors.length,
      externalRequests: externalRequests.length,
    },
    initialLoad: {
      domContentLoadedMs: navMetrics.domContentLoadedMs,
      loadEventMs: navMetrics.loadEventMs,
      fcpMs: navMetrics.fcpMs,
      requestsCount: landingResponses.length,
      transferBytes,
      responseBodyBytes: responseBytes,
      heavyCameraAssetsOnLanding: heavyOnLanding.length,
      displayFontLoaded: fontLoaded,
      fontsLoaded: fontsCheck,
      openBouldersOnLanding: introRouteCount,
      subpathSolutionCheck: solutionCheck,
      wallDemoTickAttr: navMetrics.wallDemoTickAttr,
      wallCaption: navMetrics.wallCaption,
    },
    performance: {
      introShowcase180Frames: introPerf,
      practiceClimb180Frames: practicePerf,
    },
    features: {
      routeModalSwitch: switchedRoute,
      assistedPersistenceReload: persistedAssisted.assisted,
      deepLinkMotion09: deepLinkPractice,
    },
    diagnostics: {
      url: diagnosticsUrl,
      reports: diagReports,
    },
  };

  const outPath = path.join(
    validationDir,
    isLive ? "web-live-perf.json" : "web-subpath-perf.json",
  );
  await fs.writeFile(outPath, JSON.stringify(report, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        pass: true,
        url: baseUrl,
        report: outPath,
        domContentLoadedMs: report.initialLoad.domContentLoadedMs,
        fcpMs: report.initialLoad.fcpMs,
        transferBytes: report.initialLoad.transferBytes,
        introFps: introPerf.fps,
        introP95Ms: introPerf.frameDeltaP95Ms,
        practiceFps: practicePerf.fps,
        practiceP95Ms: practicePerf.frameDeltaP95Ms,
        pairedSteadyMs: byProvider.paired.steadyStateMeanMs,
        holisticSteadyMs: byProvider.holistic.steadyStateMeanMs,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}
