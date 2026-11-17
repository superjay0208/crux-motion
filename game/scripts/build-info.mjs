import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const hash = createHash("sha256");
async function walk(path) {
  for (const e of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const p = join(path, e.name);
    if (e.isDirectory()) await walk(p);
    else {
      hash.update(p);
      hash.update(await readFile(p));
    }
  }
}
await walk("src");
for (const p of [
  "package.json",
  "package-lock.json",
  "public/models/manifest.json",
])
  hash.update(await readFile(p));
await writeFile(
  "public/build-info.json",
  JSON.stringify(
    {
      version: "0.1.0",
      sourceHash: hash.digest("hex"),
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
