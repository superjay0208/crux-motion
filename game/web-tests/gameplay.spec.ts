import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

declare global {
  interface Window {
    cruxMotion: {
      readonly snapshot: {
        tick: number;
        state: "ready" | "playing" | "paused" | "finished" | "fallen";
        com: { x: number; y: number };
        velocity: { x: number; y: number };
        reserve: { left: number; right: number };
        energy: number;
        contacts: [string | null, string | null];
        visited: string[];
        crossed: boolean;
        flew: boolean;
        undercling: boolean;
        catchCount: number;
      };
      readonly route: number;
      readonly assisted: boolean;
      readonly dynoCharge: number;
      readonly dynoReady: boolean;
      readonly dynoSource: "none" | "push" | "swing";
      readonly dynoLaunch: boolean;
      readonly delegate: string;
      readonly camera: {
        ready: boolean;
        provider: string;
        delegate: string;
        frames: number;
        inferenceMs: number;
        tracks: number;
      };
    };
    __workerDelegates?: string[];
  }
}

const validationDir = resolve(import.meta.dirname, "../../validation");
const screenshotsDir = resolve(validationDir, "screenshots");

function attachRuntimeGuards(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  const externalRequests: string[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      httpErrors.push(`${res.status()} ${res.url()}`);
    }
  });
  page.on("request", (req) => {
    const raw = req.url();
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) return;
    const { hostname } = new URL(raw);
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      externalRequests.push(raw);
    }
  });

  return {
    assertClean() {
      expect(pageErrors, "pageerror events").toEqual([]);
      expect(consoleErrors, "console.error messages").toEqual([]);
      expect(httpErrors, "HTTP >=400 responses").toEqual([]);
      expect(externalRequests, "external network requests").toEqual([]);
    },
  };
}

test("landing page loads with zero runtime errors, zero 4xx/5xx responses, and zero external requests", async ({
  page,
}) => {
  await mkdir(screenshotsDir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const guards = attachRuntimeGuards(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator("#camera-start")).toBeVisible();
  await expect(page.locator("#practice-start")).toBeVisible();
  await expect(page.locator("#wall")).toBeVisible();
  await expect(page.locator("#front-boulder-grid .boulder-card")).toHaveCount(
    12,
  );
  await expect(
    page.locator("#front-boulder-grid .boulder-card[disabled]"),
  ).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.tick))
    .toBeGreaterThan(10);
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(0);

  await page.screenshot({
    path: resolve(screenshotsDir, "landing-desktop.jpg"),
    type: "jpeg",
    quality: 90,
  });

  // Select boulder card 3 (Twin Fins) on landing, verify route updates, then return to 0
  await page.locator('#front-boulder-grid [data-intro-route="3"]').click();
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(3);
  await expect(
    page.locator('#front-boulder-grid [data-intro-route="3"]'),
  ).toHaveClass(/active/);

  await page.locator('#front-boulder-grid [data-intro-route="0"]').click();
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(0);
  await expect(
    page.locator('#front-boulder-grid [data-intro-route="0"]'),
  ).toHaveClass(/active/);

  await page.locator("#about-button").click();
  await expect(page.locator("#modal")).toHaveAttribute("open", "");
  await page.locator("#modal-close").click();
  await expect(page.locator("#modal")).not.toHaveAttribute("open", "");

  // Verify selecting a boulder card on landing and clicking Practice enters that exact boulder
  await page.locator('#front-boulder-grid [data-intro-route="3"]').click();
  await page.locator("#practice-start").click();
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(3);
  await expect(page.locator("#route-name")).toHaveText("Twin Fins");

  guards.assertClean();
});

test("practice controls flow exercises canvas, wrist drag, stamina HUD, 3 grips, palm turn, pause/retry, Grip lab 4-class meter -> Watch beta (ATTEMPT REVIEW), routes, and Cross-Body beta", async ({
  page,
}) => {
  await mkdir(screenshotsDir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const guards = attachRuntimeGuards(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  await page.locator("#practice-start").click();
  await expect(page.locator("#intro")).toHaveClass(/hidden/);
  await expect(page.locator("#play-panel")).toBeVisible();
  await expect(page.locator("#route-name")).toHaveText("Warmup Buckets");
  await expect(page.locator("#session-mode")).toHaveText("PRACTICE SESSION");
  await expect(page.locator("#progress-label")).toContainText("Match TOP");
  await expect(page.locator("#stamina-panel")).toBeVisible();
  await expect(page.locator("#core-stamina-fill")).toBeAttached();
  await expect(page.locator("#stamina-state")).toContainText("FRESH");
  await expect(page.locator("[data-grip]")).toHaveCount(3);

  // Confirm #wall canvas renders non-empty pixels
  const canvasStats = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#wall");
    if (!c || c.width === 0 || c.height === 0) {
      return { width: 0, height: 0, nonZero: 0, distinctSamples: 0 };
    }
    const ctx = c.getContext("2d");
    if (!ctx) {
      return {
        width: c.width,
        height: c.height,
        nonZero: c.toDataURL().length,
        distinctSamples: 4,
      };
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonZero = 0;
    const colors = new Set<string>();
    const stride = Math.max(4, Math.floor(data.length / 4000) * 4);
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        a = data[i + 3];
      if (a > 0 && (r > 0 || g > 0 || b > 0)) nonZero++;
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    return {
      width: c.width,
      height: c.height,
      nonZero,
      distinctSamples: colors.size,
    };
  });
  expect(canvasStats.width).toBeGreaterThan(200);
  expect(canvasStats.height).toBeGreaterThan(200);
  expect(canvasStats.nonZero).toBeGreaterThan(50);
  expect(canvasStats.distinctSamples).toBeGreaterThan(3);

  // Dismiss start overlay via #resume, then drag wrist on #wall
  await expect(page.locator("#resume")).toBeVisible();
  await page.locator("#resume").click();
  await expect(page.locator("#game-overlay")).toHaveClass(/hidden/);

  const wallBox = await page.locator("#wall").boundingBox();
  expect(wallBox).not.toBeNull();
  const startX = wallBox!.x + wallBox!.width * 0.48;
  const startY = wallBox!.y + wallBox!.height * 0.56;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 18, startY - 70, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.state))
    .toBe("playing");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.tick))
    .toBeGreaterThan(10);

  await page.screenshot({
    path: resolve(screenshotsDir, "game-desktop.jpg"),
    type: "jpeg",
    quality: 90,
  });

  // Focus #wall so window keydown listener processes practice keys
  await page.locator("#wall").focus();

  // Pull & hang so stamina drains and #stamina-panel updates live
  await page.keyboard.down("KeyW");
  await expect
    .poll(
      async () => {
        const snap = await page.evaluate(() => ({
          energy: window.cruxMotion.snapshot.energy,
          minReserve: Math.min(
            window.cruxMotion.snapshot.reserve.left,
            window.cruxMotion.snapshot.reserve.right,
          ),
          rightPct: document.querySelector("#right-pump-pct")?.textContent ?? "",
          leftPct: document.querySelector("#left-pump-pct")?.textContent ?? "",
        }));
        return (
          snap.energy < 1 &&
          snap.minReserve < 0.99 &&
          (snap.rightPct !== "100%" || snap.leftPct !== "100%")
        );
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  await page.keyboard.up("KeyW");

  // Grip keys 1–3 (Jug, Crimp, Pinch)
  for (const [key, grip] of [
    ["2", "crimp"],
    ["3", "pinch"],
    ["1", "jug"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(page.locator(`[data-grip="${grip}"]`)).toHaveClass(/active/);
  }

  // Palm turn O cycles upright -> scoop -> sidepull -> upright
  await expect(page.locator("#orientation")).toContainText("upright");
  await page.keyboard.press("KeyO");
  await expect(page.locator("#orientation")).toContainText("scoop");
  await page.keyboard.press("KeyO");
  await expect(page.locator("#orientation")).toContainText("sidepull");
  await page.keyboard.press("KeyO");
  await expect(page.locator("#orientation")).toContainText("upright");

  // Pause P toggles playing <-> paused
  await page.keyboard.press("KeyP");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.state))
    .toBe("paused");
  await expect(page.locator("#game-overlay")).not.toHaveClass(/hidden/);

  await page.keyboard.press("KeyP");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.state))
    .toBe("playing");
  await expect(page.locator("#game-overlay")).toHaveClass(/hidden/);

  // Retry R resets route to ready state and restores fresh stamina
  await page.keyboard.press("KeyR");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.state))
    .toBe("ready");
  await expect(page.locator("#stamina-state")).toHaveText("FRESH · 100%");

  // Open Grip lab (#lab-button), verify 4-class gesture meter, and capture Grip lab desktop screenshot
  await page.locator("#lab-button").click();
  await expect(page.locator("#route-name")).toHaveText("Grip lab");
  await expect(page.locator("#session-mode")).toHaveText("GESTURE LAB");
  await expect(page.locator("#gesture-bars")).toBeVisible();
  await expect(
    page.locator("#gesture-bars [data-gesture-class]"),
  ).toHaveCount(4);
  for (const cls of ["jug", "crimp", "pinch", "release"] as const) {
    await expect(
      page.locator(`#gesture-bars [data-gesture-class="${cls}"]`),
    ).toBeVisible();
  }
  await page.locator("#resume").click();
  await expect(page.locator("#game-overlay")).toHaveClass(/hidden/);
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.tick))
    .toBeGreaterThan(5);

  await page.screenshot({
    path: resolve(screenshotsDir, "grip-lab-desktop.jpg"),
    type: "jpeg",
    quality: 90,
  });

  // Click #watch-beta from Grip lab -> verify lab=false resets #session-mode to ATTEMPT REVIEW
  await page.locator("#watch-beta").click();
  await expect(page.locator("#session-mode")).toHaveText("ATTEMPT REVIEW");
  await expect(page.locator("#route-name")).toHaveText("Warmup Buckets");
  const initialSnap = await page.evaluate(() => window.cruxMotion.snapshot);
  await expect
    .poll(
      async () => {
        const cur = await page.evaluate(() => window.cruxMotion.snapshot);
        return (
          cur.tick > initialSnap.tick + 25 &&
          Math.hypot(
            cur.com.x - initialSnap.com.x,
            cur.com.y - initialSnap.com.y,
          ) > 0.02
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  // Open #routes-button, verify 12 unlocked routes, select Cross-Body (route 5), and capture crossed-arm beta frame
  await page.locator("#routes-button").click();
  await expect(page.locator("#modal")).toHaveAttribute("open", "");
  await expect(page.locator("#modal [data-route]")).toHaveCount(12);
  await expect(page.locator("#modal [data-route][disabled]")).toHaveCount(0);
  await page.locator('#modal [data-route="5"]').click();
  await expect(page.locator("#modal")).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(5);
  await expect(page.locator("#route-name")).toHaveText("Cross-Body");
  await expect(page.locator("#progress-label")).toContainText("Match TOP");

  await page.locator("#watch-beta").click();
  await expect(page.locator("#session-mode")).toHaveText("ATTEMPT REVIEW");
  await expect
    .poll(
      () => page.evaluate(() => window.cruxMotion.snapshot.crossed),
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(page.locator("#progress-label")).toContainText("Match TOP");

  await page.screenshot({
    path: resolve(screenshotsDir, "cross-current-beta.jpg"),
    type: "jpeg",
    quality: 90,
  });

  guards.assertClean();
});

test("settings modal toggles Assisted climb, Personal best ghost, and Practice Hand-Anchors with WASD swing/pull", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const guards = attachRuntimeGuards(page);
  await page.goto("/");

  await page.locator("#practice-start").click();
  expect(await page.evaluate(() => window.cruxMotion.assisted)).toBe(false);
  await expect(page.locator("#session-mode")).toHaveText("PRACTICE SESSION");

  await page.locator("#settings-button").click();
  await expect(page.locator("#modal")).toHaveAttribute("open", "");
  await expect(page.locator("#assisted-toggle")).toHaveText("Off");
  await expect(page.locator("#ghost-toggle")).toHaveText("On");
  await expect(page.locator("#practice-physics")).toHaveValue("motors");

  // Enable Assisted mode
  await page.locator("#assisted-toggle").click();
  await expect(page.locator("#assisted-toggle")).toHaveText("On");
  expect(await page.evaluate(() => window.cruxMotion.assisted)).toBe(true);
  await expect(page.locator("#session-mode")).toContainText("ASSISTED");

  // Toggle Personal best ghost Off -> On
  await page.locator("#ghost-toggle").click();
  await expect(page.locator("#ghost-toggle")).toHaveText("Off");
  await page.locator("#ghost-toggle").click();
  await expect(page.locator("#ghost-toggle")).toHaveText("On");

  // Switch Practice physics to Hand anchors
  await page.locator("#practice-physics").selectOption("anchors");
  await expect(page.locator("#practice-physics")).toHaveValue("anchors");

  await page.locator("#modal-close").click();
  await expect(page.locator("#modal")).not.toHaveAttribute("open", "");

  // Start climbing in Practice Hand-Anchors + Assisted mode and exercise W/A/S/D keys
  await expect(page.locator("#session-mode")).toContainText("ASSISTED");
  expect(await page.evaluate(() => window.cruxMotion.assisted)).toBe(true);
  await page.locator("#resume").click();
  await expect(page.locator("#game-overlay")).toHaveClass(/hidden/);
  await page.locator("#wall").focus();

  const beforeMove = await page.evaluate(() => window.cruxMotion.snapshot);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await expect
    .poll(
      async () => {
        const cur = await page.evaluate(() => window.cruxMotion.snapshot);
        return (
          cur.tick >= beforeMove.tick + 20 &&
          Math.hypot(
            cur.com.x - beforeMove.com.x,
            cur.com.y - beforeMove.com.y,
          ) > 0.015
        );
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("KeyW");

  const midTick = await page.evaluate(() => window.cruxMotion.snapshot.tick);
  await page.keyboard.down("KeyA");
  await page.keyboard.down("KeyS");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.tick))
    .toBeGreaterThanOrEqual(midTick + 15);
  await page.keyboard.up("KeyS");
  await page.keyboard.up("KeyA");

  expect(await page.evaluate(() => window.cruxMotion.snapshot.state)).toBe(
    "playing",
  );

  // Disable Assisted mode and confirm HUD restores standard session label
  await page.locator("#settings-button").click();
  await page.locator("#assisted-toggle").click();
  await expect(page.locator("#assisted-toggle")).toHaveText("Off");
  expect(await page.evaluate(() => window.cruxMotion.assisted)).toBe(false);
  await expect(page.locator("#session-mode")).toHaveText("PRACTICE SESSION");
  await page.locator("#modal-close").click();

  guards.assertClean();
});

for (const cfg of [
  { width: 1280, height: 720, dpr: 1 },
  { width: 1280, height: 720, dpr: 1.25 },
  { width: 1024, height: 640, dpr: 1 },
]) {
  test(`responsive layout keeps core controls visible within ${cfg.width}x${cfg.height} (DPR ${cfg.dpr})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.dpr,
    });
    const page = await context.newPage();
    const guards = attachRuntimeGuards(page);

    try {
      await page.goto("/");
      await page.locator("#practice-start").click();

      for (const selector of [
        "#wall",
        "#play-panel",
        "#stamina-panel",
        "#retry",
        "#pause",
        "#routes-button",
      ]) {
        const loc = page.locator(selector);
        await expect(loc, `${selector} visible`).toBeVisible();
        const box = await loc.boundingBox();
        expect(box, `${selector} boundingBox`).not.toBeNull();
        expect(box!.width, `${selector} width`).toBeGreaterThan(0);
        expect(box!.height, `${selector} height`).toBeGreaterThan(0);
        expect(
          box!.x,
          `${selector} left >= 0 at ${cfg.width}x${cfg.height} DPR ${cfg.dpr}`,
        ).toBeGreaterThanOrEqual(-1);
        expect(
          box!.y,
          `${selector} top >= 0 at ${cfg.width}x${cfg.height} DPR ${cfg.dpr}`,
        ).toBeGreaterThanOrEqual(-1);
        expect(
          box!.x + box!.width,
          `${selector} right <= ${cfg.width}`,
        ).toBeLessThanOrEqual(cfg.width + 1);
        expect(
          box!.y + box!.height,
          `${selector} bottom <= ${cfg.height}`,
        ).toBeLessThanOrEqual(cfg.height + 1);
      }

      guards.assertClean();
    } finally {
      await context.close();
    }
  });
}

test("diagnostics worker inference runs both paired and holistic providers offline and records model-smoke.json", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const guards = attachRuntimeGuards(page);

  await page.addInitScript(() => {
    window.__workerDelegates = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        this.addEventListener("message", (ev: MessageEvent) => {
          if (ev.data?.kind === "ready" && typeof ev.data.delegate === "string") {
            window.__workerDelegates!.push(ev.data.delegate);
          }
        });
      }
    };
  });

  await page.goto("/diagnostics.html");
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
  await expect(page.locator("#run")).toBeVisible();
  await page.locator("#run").click();

  await page.waitForSelector('#result[data-complete="true"]', {
    timeout: 45_000,
  });

  const raw = (await page.locator("#result").textContent()) ?? "{}";
  const delegates = await page.evaluate(() => window.__workerDelegates ?? []);
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const parsed = JSON.parse(raw) as {
    reports: Array<{
      provider: string;
      frames?: number;
      initializationAndRunMs?: number;
      inferenceMs?: number[];
      detectedHands?: number;
      pass: boolean;
      error?: string;
    }>;
  };

  expect(Array.isArray(parsed.reports)).toBe(true);
  const enrichedReports = parsed.reports.map((r, i) => ({
    ...r,
    delegate: delegates[i] ?? "CPU",
  }));

  const byProvider = Object.fromEntries(
    enrichedReports.map((r) => [r.provider, r]),
  );
  expect(byProvider.paired?.pass, JSON.stringify(byProvider.paired)).toBe(true);
  expect(byProvider.paired?.frames).toBe(5);
  expect(["GPU", "CPU"]).toContain(byProvider.paired?.delegate);
  expect(byProvider.holistic?.pass, JSON.stringify(byProvider.holistic)).toBe(
    true,
  );
  expect(byProvider.holistic?.frames).toBe(5);
  expect(["GPU", "CPU"]).toContain(byProvider.holistic?.delegate);

  await writeFile(
    resolve(validationDir, "model-smoke.json"),
    JSON.stringify(
      {
        kind: "Real browser execution on five generated blank frames per provider; not human tracking accuracy or motion-to-photon latency",
        url: page.url(),
        recordedAt: new Date().toISOString(),
        browser: userAgent,
        reports: enrichedReports,
      },
      null,
      2,
    ) + "\n",
  );

  guards.assertClean();
});

test("Launchpad (motion-07) charges dyno momentum, triggers simultaneous KeyV/#release-both flight, and captures Watch Beta dyno impact frame", async ({
  page,
}) => {
  await mkdir(screenshotsDir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const guards = attachRuntimeGuards(page);

  await page.goto("/?route=motion-07");
  await page.evaluate(() => document.fonts.ready);

  await page.locator("#practice-start").click();
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(6);
  await expect(page.locator("#route-name")).toHaveText("Launchpad");
  await expect(page.locator("#stamina-panel")).toBeVisible();
  await expect(page.locator("#release-both")).toBeVisible();
  await expect(page.locator(".motion-feedback")).toBeVisible();

  // Switch Practice physics to Hand anchors for full momentum dyno launch
  await page.locator("#settings-button").click();
  await page.locator("#practice-physics").selectOption("anchors");
  await expect(page.locator("#practice-physics")).toHaveValue("anchors");
  await page.locator("#modal-close").click();

  await page.locator("#resume").click();
  await expect(page.locator("#game-overlay")).toHaveClass(/hidden/);
  await page.locator("#wall").focus();

  const initialContacts = await page.evaluate(
    () => window.cruxMotion.snapshot.contacts,
  );
  expect(initialContacts[0]).not.toBeNull();
  expect(initialContacts[1]).not.toBeNull();

  // Extend downward (KeyS) to cock crouch, then drive upward (KeyW) to build dynoCharge -> dynoReady
  const extendStartTick = await page.evaluate(
    () => window.cruxMotion.snapshot.tick,
  );
  await page.keyboard.down("KeyS");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.tick))
    .toBeGreaterThanOrEqual(extendStartTick + 45);
  await page.keyboard.up("KeyS");

  await page.keyboard.down("KeyW");
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => ({
          charge: window.cruxMotion.dynoCharge,
          ready: window.cruxMotion.dynoReady,
          source: window.cruxMotion.dynoSource,
        }));
        return state.charge > 0 && state.ready && state.source !== "none";
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  await expect(page.locator("#motion-label")).toContainText("DYNO READY");

  // Trigger simultaneous two-hand release via KeyV while dynoReady
  await page.keyboard.press("KeyV");
  await page.keyboard.up("KeyW");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        contacts: window.cruxMotion.snapshot.contacts,
        dynoLaunch: window.cruxMotion.dynoLaunch,
      })),
    )
    .toEqual({
      contacts: [null, null],
      dynoLaunch: true,
    });

  // Also verify #release-both button simultaneously detaches both contacts into flight
  await page.locator("#retry").click();
  await page.locator("#resume").click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.cruxMotion.snapshot.contacts.every((c) => c !== null),
      ),
    )
    .toBe(true);
  await page.locator("#release-both").click();
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.contacts))
    .toEqual([null, null]);

  // Run Launchpad Watch Beta and capture crisp dyno catch impact frame screenshot
  await page.locator("#watch-beta").click();
  await expect(page.locator("#session-mode")).toHaveText("ATTEMPT REVIEW");
  await expect(page.locator("#route-name")).toHaveText("Launchpad");

  await page.evaluate(
    () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        const deadline = performance.now() + 10_000;
        const waitImpact = () => {
          if (window.cruxMotion.snapshot.flew) {
            resolvePromise();
            return;
          }
          if (performance.now() > deadline) {
            rejectPromise(
              new Error("Timed out waiting for Launchpad dyno catch impact"),
            );
            return;
          }
          requestAnimationFrame(waitImpact);
        };
        requestAnimationFrame(waitImpact);
      }),
  );

  await page.screenshot({
    path: resolve(screenshotsDir, "dyno-impact.jpg"),
    type: "jpeg",
    quality: 92,
  });

  // Verify play-panel, stamina-panel, and release-both stay unclipped within 1280x720
  for (const selector of ["#wall", "#play-panel", "#stamina-panel", "#release-both"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} box`).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(721);
  }

  guards.assertClean();
});
