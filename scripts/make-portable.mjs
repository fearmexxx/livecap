#!/usr/bin/env node
// Builds the "unzip and double-click" LiveCap download for room laptops.
// Each zip contains a portable Node.js runtime, the prebuilt app and a start script,
// so the laptop needs no Node, npm, git or build step.
//
//   node scripts/make-portable.mjs                      # all targets
//   node scripts/make-portable.mjs win-x64 darwin-arm64  # some targets
//   node scripts/make-portable.mjs --skip-build linux-x64
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NODE_VERSION = "v24.22.2";
const TARGETS = {
  "win-x64": { archive: "zip", launcher: "START LiveCap.bat", nodeBin: "node.exe" },
  "darwin-arm64": { archive: "tar.gz", launcher: "START LiveCap.command", nodeBin: "bin/node" },
  "darwin-x64": { archive: "tar.gz", launcher: "START LiveCap.command", nodeBin: "bin/node" },
  "linux-x64": { archive: "tar.gz", launcher: "START LiveCap.command", nodeBin: "bin/node" },
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const wanted = args.filter((a) => !a.startsWith("--"));
const targets = wanted.length ? wanted : ["win-x64", "darwin-arm64", "darwin-x64"];
for (const t of targets) if (!TARGETS[t]) throw new Error(`Unknown target ${t}. Use: ${Object.keys(TARGETS).join(", ")}`);

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const outDir = join(root, "dist", "portable");
const cacheDir = join(root, "dist", ".node-cache");
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd: root, ...opts });

if (!skipBuild) {
  console.log("Building standalone app...");
  rmSync(join(root, ".next"), { recursive: true, force: true });
  run("npx", ["next", "build", "--webpack"], { env: { ...process.env, LIVECAP_STANDALONE: "1" } });
}
const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) throw new Error("No .next/standalone/server.js. Run without --skip-build.");

async function nodeRuntime(target) {
  const { archive } = TARGETS[target];
  const name = `node-${NODE_VERSION}-${target}`;
  const extracted = join(cacheDir, name);
  if (existsSync(extracted)) return extracted;
  const file = join(cacheDir, `${name}.${archive}`);
  if (!existsSync(file)) {
    const url = `https://nodejs.org/dist/${NODE_VERSION}/${name}.${archive}`;
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  if (archive === "zip") run("unzip", ["-q", "-o", file, "-d", cacheDir]);
  else run("tar", ["-xzf", file, "-C", cacheDir]);
  return extracted;
}

for (const target of targets) {
  const { launcher, nodeBin } = TARGETS[target];
  const folderName = `LiveCap-${version}-${target}`;
  const dest = join(outDir, folderName);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  // App: the standalone server plus the static assets it expects next to it
  const app = join(dest, "app");
  cpSync(standalone, app, { recursive: true, verbatimSymlinks: true });
  cpSync(join(root, ".next", "static"), join(app, ".next", "static"), { recursive: true });
  cpSync(join(root, "public"), join(app, "public"), { recursive: true });
  // Never ship this machine's local env files inside the download
  for (const f of readdirSync(app)) if (f.startsWith(".env")) rmSync(join(app, f), { force: true });

  // Runtime: only the node binary (+ license), not npm
  const runtime = await nodeRuntime(target);
  const nodeDir = join(dest, "node");
  mkdirSync(join(nodeDir, dirname(nodeBin)), { recursive: true });
  cpSync(join(runtime, nodeBin), join(nodeDir, nodeBin));
  cpSync(join(runtime, "LICENSE"), join(nodeDir, "LICENSE"));

  // Launcher, settings template and instructions
  // Windows needs CRLF (cmd.exe labels/goto, Notepad); Mac/Linux shells need LF. Normalise here so
  // the result does not depend on how git checked the files out.
  const eol = target.startsWith("win") ? "\r\n" : "\n";
  for (const name of [launcher, "livecap.env", "README-FIRST.txt"]) {
    const text = readFileSync(join(root, "portable", name), "utf8").replace(/\r?\n/g, eol);
    writeFileSync(join(dest, name), text);
  }
  if (!target.startsWith("win")) {
    chmodSync(join(dest, launcher), 0o755);
    chmodSync(join(nodeDir, nodeBin), 0o755);
  }

  const zipPath = join(outDir, `${folderName}.zip`);
  rmSync(zipPath, { force: true });
  run("zip", ["-q", "-r", "-y", zipPath, folderName], { cwd: outDir });
  console.log(`Created ${zipPath}`);
}

