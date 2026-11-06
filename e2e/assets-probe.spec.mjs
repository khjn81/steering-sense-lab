import { test, expect } from "@playwright/test";
test("real local WASM and model infer a blank frame under the content policy", async ({
  page,
  context,
}) => {
  test.setTimeout(45000);
  const external = [];
  context.on("requestfinished", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4190/") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("#sceneLoading")).toBeHidden();
  const result = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const worker = new Worker("/hand-worker.js");
        const timer = setTimeout(
          () => finish(null, "Model probe timed out"),
          35000,
        );
        function finish(value, error) {
          clearTimeout(timer);
          worker.terminate();
          error ? reject(new Error(error)) : resolve(value);
        }
        worker.onerror = (e) => finish(null, e.message);
        worker.onmessage = async ({ data }) => {
          try {
            if (data.type === "error") return finish(null, data.message);
            if (data.type === "ready") {
              const canvas = new OffscreenCanvas(640, 480);
              canvas.getContext("2d").fillRect(0, 0, 640, 480);
              const bitmap = await createImageBitmap(canvas);
              worker.postMessage(
                { type: "frame", bitmap, timestamp: performance.now() },
                [bitmap],
              );
            }
            if (data.type === "hands") finish({ hands: data.landmarks.length });
          } catch (error) {
            finish(null, error.message);
          }
        };
        worker.postMessage({ type: "init" });
      }),
  );
  expect(result.hands).toBe(0);
  expect(external).toEqual([]);
});
