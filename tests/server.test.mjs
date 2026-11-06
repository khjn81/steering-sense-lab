import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
let child, base;
before(async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn("python3", ["serve.py", "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(
      () => reject(new Error("Owned server startup timed out")),
      5000,
    );
    child.stdout.on("data", (chunk) => {
      text += chunk;
      if (text.includes(base)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", reject);
  });
});
after(async () => {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
test("loopback server supplies a local-only content policy and correct executable MIME", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const policy = response.headers.get("content-security-policy") || "";
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  for (const [path, type] of [
    ["/app.mjs", "text/javascript"],
    ["/vendor/mediapipe/wasm/vision_wasm_internal.wasm", "application/wasm"],
  ]) {
    const r = await fetch(base + path, { method: "HEAD" });
    assert.equal(r.status, 200);
    assert.ok(r.headers.get("content-type").includes(type));
  }
});
test("server public boundaries exclude diagnostic routes and directory listings", async () => {
  for (const path of [
    "/serve.py",
    "/package.json",
    "/.git/config",
    "/__test__",
    "/vendor/",
  ]) {
    const r = await fetch(base + path);
    await r.text();
    assert.equal(r.status, 404, path);
  }
});
