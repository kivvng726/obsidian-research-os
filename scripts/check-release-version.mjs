import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expected = process.argv[2] || "0.6.0-beta.2";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, ".obsidian/plugins/research-os/manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const versionSource = await readFile(path.join(root, "backend/app/version.py"), "utf8");
const backendVersion = versionSource.match(/BACKEND_VERSION\s*=\s*"([^"]+)"/)?.[1];
const apiVersion = Number(versionSource.match(/API_VERSION\s*=\s*(\d+)/)?.[1]);
const values = [manifest.version, packageJson.version, backendVersion];
if (!values.every(value => value === expected) || apiVersion !== 1) {
  throw new Error(`Release version mismatch: manifest=${manifest.version}, package=${packageJson.version}, backend=${backendVersion}, api=${apiVersion}`);
}
console.log(`Release versions aligned: ${expected}; API version: ${apiVersion}`);
