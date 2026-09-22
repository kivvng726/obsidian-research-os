import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTestVaultReady, deployTestBundle, sha256 } from "./deploy-test-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repoRoot, ".obsidian", "plugins", "research-os", "main.source.js");
const goldenMain = path.join(repoRoot, ".obsidian", "plugins", "research-os", "main.js");
const outputDir = path.join(repoRoot, "dist-test");
const bundle = path.join(outputDir, "main.js");
await assertTestVaultReady();
const goldenHashBefore = await sha256(goldenMain);

await mkdir(outputDir, { recursive: true });
await build({
  entryPoints: [source],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["obsidian"],
  outfile: bundle
});

await deployTestBundle(bundle);

const goldenHashAfter = await sha256(goldenMain);
if (goldenHashBefore !== goldenHashAfter) throw new Error("Golden main.js changed during build:test; deployment aborted.");
console.log(`Golden main.js unchanged: ${goldenHashAfter}`);
