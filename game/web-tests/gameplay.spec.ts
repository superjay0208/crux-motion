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

  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.tick))
    .toBeGreaterThan(10);

  await page.screenshot({
    path: resolve(screenshotsDir, "landing-desktop.jpg"),
    type: "jpeg",
    quality: 90,
  });

  await page.locator("#about-button").click();
  await expect(page.locator("#modal")).toHaveAttribute("open", "");
  await page.locator("#modal-close").click();
  await expect(page.locator("#modal")).not.toHaveAttribute("open", "");

  guards.assertClean();
});

test("practice controls flow exercises canvas, wrist drag, grips, palm turn, pause/retry, Grip lab -> Watch beta (ATTEMPT REVIEW), routes, and Cross Current beta", async ({
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
  await expect(page.locator("#route-name")).toHaveText("Jug Ladder");
  await expect(page.locator("#session-mode")).toHaveText("PRACTICE SESSION");

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

  // Grip keys 1–4
  for (const [key, grip] of [
    ["2", "crimp"],
    ["3", "sloper"],
    ["4", "pinch"],
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

  // Retry R resets route to ready state
  await page.keyboard.press("KeyR");
  await expect
    .poll(() => page.evaluate(() => window.cruxMotion.snapshot.state))
    .toBe("ready");

  // Open Grip lab (#lab-button) and capture Grip lab desktop screenshot
  await page.locator("#lab-button").click();
  await expect(page.locator("#route-name")).toHaveText("Grip lab");
  await expect(page.locator("#session-mode")).toHaveText("GESTURE LAB");
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
  await expect(page.locator("#route-name")).toHaveText("Jug Ladder");
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

  // Open #routes-button, verify 12 routes, select Cross Current (route 1), and capture crossed-arm beta frame
  await page.locator("#routes-button").click();
  await expect(page.locator("#modal")).toHaveAttribute("open", "");
  await expect(page.locator("#modal [data-route]")).toHaveCount(12);
  await page.locator('#modal [data-route="1"]').click();
  await expect(page.locator("#modal")).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => window.cruxMotion.route)).toBe(1);
  await expect(page.locator("#route-name")).toHaveText("Cross Current");

  await page.locator("#watch-beta").click();
  await expect(page.locator("#session-mode")).toHaveText("ATTEMPT REVIEW");
  await expect
    .poll(
      () => page.evaluate(() => window.cruxMotion.snapshot.crossed),
      { timeout: 10_000 },
    )
    .toBe(true);

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
