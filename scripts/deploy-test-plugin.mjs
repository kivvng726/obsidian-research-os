import { createHash } from "node:crypto";
import { access, copyFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginSource = path.join(repoRoot, ".obsidian", "plugins", "research-os");
const staticFiles = ["manifest.json", "styles.css", "forest.jpg"];

function requiredTestVault() {
  const configured = process.env.RESEARCH_OS_TEST_VAULT?.trim();
  if (!configured) throw new Error("RESEARCH_OS_TEST_VAULT is required. Set it to a dedicated Obsidian test Vault path.");
  const vault = path.resolve(configured);
  const root = path.parse(vault).root;
  if (vault === root || vault === repoRoot || vault.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error("RESEARCH_OS_TEST_VAULT must be a dedicated Vault outside this repository and cannot be a filesystem root.");
  }
  return vault;
}

async function isDirectory(target) {
  try { return (await stat(target)).isDirectory(); } catch { return false; }
}

async function requireStaticFiles() {
  for (const name of staticFiles) {
    const source = path.join(pluginSource, name);
    try { await access(source); } catch { throw new Error(`Required plugin asset is missing: ${source}`); }
  }
}

async function copyStaticFiles(destination) {
  await requireStaticFiles();
  for (const name of staticFiles) await replaceFileSafely(path.join(pluginSource, name), path.join(destination, name));
}

async function replaceFileSafely(source, destination) {
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await copyFile(source, temporary);
  await rename(temporary, destination);
}

function pluginDestination(vault) {
  return path.join(vault, ".obsidian", "plugins", "research-os");
}

export async function assertTestVaultReady() {
  const vault = requiredTestVault();
  if (!(await isDirectory(vault))) throw new Error(`Test Vault does not exist: ${vault}. Run npm run test:vault:init first.`);
  const destination = pluginDestination(vault);
  if (!(await isDirectory(destination))) throw new Error(`Test plugin directory does not exist: ${destination}. Run npm run test:vault:init first.`);
  return { vault, destination };
}

export async function initTestVault({ create = false } = {}) {
  const vault = requiredTestVault();
  if (!(await isDirectory(vault))) {
    if (!create) throw new Error(`Test Vault does not exist: ${vault}\nConfirm the path, then run: npm run test:vault:init -- --create`);
    await mkdir(vault, { recursive: true });
  }

  const destination = pluginDestination(vault);
  await mkdir(destination, { recursive: true });
  await copyStaticFiles(destination);
  await writeFile(path.join(vault, "README_TESTING.md"), [
    "# Research OS test Vault",
    "",
    "This Vault is used only for isolated Research OS plugin testing.",
    "After `npm run build:test`, reload Obsidian or disable and re-enable the Research OS plugin to load the new bundle.",
    "Do not place production research data in this Vault."
  ].join("\n"), "utf8");

  console.log(`Initialized test Vault: ${vault}`);
  console.log(`Plugin assets deployed to: ${destination}`);
}

export async function sha256(file) {
  const { readFile } = await import("node:fs/promises");
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function deployTestBundle(bundlePath) {
  const { vault, destination } = await assertTestVaultReady();
  try { await access(bundlePath); } catch { throw new Error(`Test bundle does not exist: ${bundlePath}`); }

  await copyStaticFiles(destination);
  const target = path.join(destination, "main.js");
  await replaceFileSafely(bundlePath, target);

  const bundle = await stat(bundlePath);
  console.log("Test build deployed successfully.");
  console.log(`Bundle size: ${bundle.size} bytes`);
  console.log(`Test Vault: ${vault}`);
  console.log(`Deployment target: ${target}`);
  console.log(`SHA-256: ${await sha256(target)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "init") throw new Error("Usage: node scripts/deploy-test-plugin.mjs init [--create]");
  await initTestVault({ create: args.includes("--create") });
}
