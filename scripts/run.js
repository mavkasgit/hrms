#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const isWindows = os.platform() === "win32";
const scriptsDir = __dirname;
const [, , scriptName, ...args] = process.argv;

if (!scriptName) {
  console.error("Usage: node scripts/run.js <script-name> [...args]");
  process.exit(1);
}

function toWslPath(windowsPath) {
  return windowsPath.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d) => `/mnt/${d.toLowerCase()}`);
}

function runWindows(scriptBase, scriptArgs) {
  const jsPath = path.join(scriptsDir, `${scriptBase}.js`);
  if (fs.existsSync(jsPath)) {
    console.log(`▶ Node.js: ${jsPath}`);
    return spawnSync("node", [jsPath, ...scriptArgs], { stdio: "inherit" });
  }

  const ps1Path = path.join(scriptsDir, `${scriptBase}.ps1`);
  if (fs.existsSync(ps1Path)) {
    console.log(`▶ PowerShell: ${ps1Path}`);
    return spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1Path, ...scriptArgs],
      { stdio: "inherit" },
    );
  }

  const shPath = path.join(scriptsDir, `${scriptBase}.sh`);
  if (fs.existsSync(shPath)) {
    console.log(`▶ WSL fallback: ${shPath}`);
    return spawnSync("wsl", ["bash", toWslPath(shPath), ...scriptArgs], { stdio: "inherit" });
  }

  return null;
}

function runUnix(scriptBase, scriptArgs) {
  const shPath = path.join(scriptsDir, `${scriptBase}.sh`);
  if (fs.existsSync(shPath)) {
    console.log(`▶ bash: ${shPath}`);
    try {
      fs.chmodSync(shPath, 0o755);
    } catch {
      // Best-effort chmod, continue anyway.
    }
    return spawnSync("bash", [shPath, ...scriptArgs], { stdio: "inherit" });
  }

  const jsPath = path.join(scriptsDir, `${scriptBase}.js`);
  if (fs.existsSync(jsPath)) {
    console.log(`▶ Node.js: ${jsPath}`);
    return spawnSync("node", [jsPath, ...scriptArgs], { stdio: "inherit" });
  }

  return null;
}

const result = isWindows ? runWindows(scriptName, args) : runUnix(scriptName, args);

if (!result) {
  console.error(`❌ Script not found: ${scriptName} (.sh / .ps1 / .js)`);
  process.exit(1);
}

process.exit(result.status ?? 1);
