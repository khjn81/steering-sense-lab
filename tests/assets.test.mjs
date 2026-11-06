import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { verifyAssets } from "../scripts/assets-check.mjs";
test("all bundled runtime/model files match the verified manifest", async () => {
  const result = await verifyAssets();
  assert.ok(result.files >= 10);
  assert.ok(result.bytes > 1000000);
});
test("asset verification catches changed file bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "steering-asset-test-"));
  const data = Buffer.from("verified fixture");
  const assets = [
    {
      path: "asset.bin",
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    },
  ];
  try {
    await writeFile(join(root, "asset.bin"), data);
    await verifyAssets({ root, assets });
    await writeFile(join(root, "asset.bin"), "changed");
    await assert.rejects(verifyAssets({ root, assets }), /integrity mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
