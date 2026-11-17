const button = document.querySelector<HTMLButtonElement>("#run")!,
  out = document.querySelector<HTMLPreElement>("#result")!;
button.onclick = async () => {
  button.disabled = true;
  const reports = [];
  out.textContent = "Loading local models…";
  for (const provider of ["paired", "holistic"]) {
    const worker = new Worker(
      new URL(
        "tracking.worker.js",
        new URL(import.meta.env.BASE_URL, location.href),
      ),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#b0b0b0";
    ctx.fillRect(0, 0, 640, 480);
    try {
      const started = performance.now(),
        r = await new Promise<object>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Provider timed out")),
            60000,
          );
          let frames = 0;
          const times: number[] = [];
          worker.onerror = (e) => {
            clearTimeout(timeout);
            reject(new Error(e.message));
          };
          worker.onmessage = async ({ data }) => {
            if (data.kind === "error") {
              clearTimeout(timeout);
              reject(new Error(data.message));
              return;
            }
            if (data.kind === "result") {
              frames++;
              times.push(data.inferenceMs);
              if (data.detections.length || data.pose.length) {
                clearTimeout(timeout);
                reject(new Error("Unexpected detection on blank frame"));
                return;
              }
              if (frames === 5) {
                clearTimeout(timeout);
                resolve({
                  provider,
                  frames,
                  initializationAndRunMs: performance.now() - started,
                  inferenceMs: times,
                  detectedHands: 0,
                  pass: true,
                });
                return;
              }
            }
            const frame = await createImageBitmap(canvas);
            worker.postMessage(
              {
                kind: "frame",
                frame,
                t: performance.now(),
                width: 640,
                height: 480,
                sequence: frames + 1,
              },
              [frame],
            );
          };
          // Initialize separately; only submit frames after the ready message.
          worker.postMessage({
            kind: "init",
            provider,
            base: new URL(import.meta.env.BASE_URL, location.href).href,
          });
        });
      reports.push(r);
    } catch (e) {
      reports.push({ provider, pass: false, error: (e as Error).message });
    } finally {
      worker.terminate();
    }
    out.textContent = JSON.stringify({ reports }, null, 2);
  }
  button.disabled = false;
  out.dataset.complete = "true";
};
