import { mkdir, mkdtemp, copyFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = join(root, ".improvement-runs");
await mkdir(scratch, { recursive: true });
const temporary = await mkdtemp(join(scratch, "clean-checkout-"));
try {
  const files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    await mkdir(dirname(join(temporary, file)), { recursive: true });
    await copyFile(join(root, file), join(temporary, file));
  }
  for (const [command, args] of [
    ["npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]],
    ["node", ["scripts/assets-check.mjs"]],
    ["npm", ["test"]],
  ])
    execFileSync(command, args, { cwd: temporary, stdio: "inherit" });
  console.log(
    "Clean tracked-source install, asset integrity and unit/process checks passed.",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
