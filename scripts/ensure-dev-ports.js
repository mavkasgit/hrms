/**
 * Ensure HRMS local dev ports are free before npm run dev.
 *
 * Ports: 8011 (backend), 5173 (Vite frontend).
 *
 * Why not kill-port alone?
 *   On Windows kill-port uses TaskKill /F /PID without /T → orphan
 *   uvicorn/multiprocessing workers can keep the socket (WinError 10048).
 *
 * Usage:
 *   node scripts/ensure-dev-ports.js           # interactive if TTY; else fail if busy
 *   node scripts/ensure-dev-ports.js --kill    # kill without prompt
 *   node scripts/ensure-dev-ports.js --check   # report only; exit 1 if busy
 *   HRMS_DEV_KILL=1                            # same as --kill
 *
 * Safety: LISTENING only; skips PID 0–4 and own PID; process tree kill on Windows.
 */

"use strict";

const { execFileSync, spawnSync } = require("child_process");
const readline = require("readline");
const os = require("os");

const DEFAULT_PORTS = [8011, 5173];
const isWin = process.platform === "win32";

function parseArgs(argv) {
  const forceKill =
    argv.includes("--kill") ||
    argv.includes("--force") ||
    argv.includes("-y") ||
    process.env.HRMS_DEV_KILL === "1" ||
    process.env.HRMS_DEV_KILL === "true";
  const checkOnly = argv.includes("--check");
  const ports = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ports" && argv[i + 1]) {
      ports.push(
        ...argv[i + 1]
          .split(",")
          .map((p) => Number(p.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      );
      i++;
    }
  }
  return {
    forceKill,
    checkOnly,
    ports: ports.length ? ports : DEFAULT_PORTS,
  };
}

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      windowsHide: true,
      ...opts,
    });
  } catch (err) {
    if (err && typeof err.stdout === "string") return err.stdout;
    return "";
  }
}

/** @returns {Map<number, Set<number>>} port -> set of PIDs */
function findListeningPids(ports) {
  const map = new Map();
  for (const port of ports) map.set(port, new Set());

  if (isWin) {
    // netstat -ano: TCP  0.0.0.0:8000  0.0.0.0:0  LISTENING  12345
    const out = run("cmd.exe", ["/d", "/s", "/c", "netstat -ano"]);
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;
      const local = parts[1] || "";
      const state = parts[parts.length - 2] || "";
      const pidStr = parts[parts.length - 1] || "";
      if (!/LISTENING/i.test(state)) continue;
      const m = local.match(/:(\d+)$/);
      if (!m) continue;
      const port = Number(m[1]);
      const pid = Number(pidStr);
      if (!map.has(port) || !Number.isFinite(pid)) continue;
      map.get(port).add(pid);
    }
  } else {
    for (const port of ports) {
      // lsof -ti :PORT  (PIDs only)
      const out = run("sh", ["-c", `lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true`]);
      for (const line of out.split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (Number.isFinite(pid) && pid > 0) map.get(port).add(pid);
      }
    }
  }

  return map;
}

function processInfo(pid) {
  if (!Number.isFinite(pid) || pid <= 4) {
    return { pid, name: "(system)", cmd: "" };
  }
  if (isWin) {
    // wmic may be missing on newer Windows — use tasklist / PowerShell fallback
    let name = "unknown";
    let cmd = "";
    try {
      const tl = run("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
      // "python.exe","12345","Session","1","12 345 K"
      const m = tl.match(/"([^"]+)","(\d+)"/);
      if (m && Number(m[2]) === pid) name = m[1];
    } catch {
      /* ignore */
    }
    try {
      const ps = run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ]);
      cmd = (ps || "").trim().replace(/\s+/g, " ");
      if (cmd.length > 160) cmd = cmd.slice(0, 157) + "...";
    } catch {
      /* ignore */
    }
    return { pid, name, cmd };
  }
  let name = "unknown";
  let cmd = "";
  try {
    name = run("ps", ["-p", String(pid), "-o", "comm="]).trim() || name;
    cmd = run("ps", ["-p", String(pid), "-o", "args="]).trim();
    if (cmd.length > 160) cmd = cmd.slice(0, 157) + "...";
  } catch {
    /* ignore */
  }
  return { pid, name, cmd };
}

function isDockerProcess(info) {
  const name = (info.name || "").toLowerCase();
  const cmd = (info.cmd || "").toLowerCase();
  return (
    name.includes("docker") ||
    cmd.includes("docker") ||
    name.includes("vmmem") ||
    name.includes("vpnkit") ||
    cmd.includes("vpnkit") ||
    name.includes("wslrelay") ||
    cmd.includes("wslrelay")
  );
}

function collectOccupants(portMap) {
  /** @type {{ port: number, pid: number, name: string, cmd: string, isDocker: boolean }[]} */
  const rows = [];
  const seen = new Set();
  for (const [port, pids] of portMap) {
    for (const pid of pids) {
      if (pid <= 4 || pid === process.pid) continue;
      const key = `${port}:${pid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const info = processInfo(pid);
      const isDocker = isDockerProcess(info);
      rows.push({ port, pid, name: info.name, cmd: info.cmd, isDocker });
    }
  }
  return rows;
}

function killTree(pid) {
  if (!Number.isFinite(pid) || pid <= 4 || pid === process.pid) return false;
  if (isWin) {
    // /T = process tree (critical for uvicorn reloader orphans)
    const r = spawnSync("taskkill.exe", ["/F", "/T", "/PID", String(pid)], {
      encoding: "utf8",
      windowsHide: true,
    });
    // exit 0 = killed; 128 = not found (already gone) — both OK for cleanup
    return r.status === 0 || r.status === 128;
  }
  // Unix: try process group, then PID; SIGTERM then SIGKILL
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    } catch {
      return true; // gone
    }
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  return true;
}

function sleepMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* spin */
    }
  }
}

function printOccupants(rows) {
  console.log("");
  console.log("⚠  Dev ports already in use (LISTENING):");
  console.log("   (old uvicorn/vite orphans cause WinError 10048 / EADDRINUSE and stale API)");
  console.log("");
  for (const row of rows) {
    if (row.isDocker) {
      console.log(`   :${row.port}  PID ${row.pid}  ${row.name} [DOCKER - PROTECTED]`);
      if (row.cmd) console.log(`           ${row.cmd}`);
      console.log(`           ℹ Docker process detected — skipping kill to protect Docker Desktop.`);
    } else {
      console.log(`   :${row.port}  PID ${row.pid}  ${row.name}`);
      if (row.cmd) console.log(`           ${row.cmd}`);
    }
  }
  console.log("");
}

function askYesNo(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      resolve(false);
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const a = String(answer || "").trim().toLowerCase();
      // Pressing Enter (empty string) defaults to YES (true). Also accepts y/yes/д/да.
      resolve(a === "" || a === "y" || a === "yes" || a === "д" || a === "да");
    });
  });
}

function isDockerDaemonReady() {
  try {
    const r = spawnSync("docker", ["info"], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function startDockerDesktop() {
  if (isWin) {
    const exePath = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
    try {
      spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `if (Test-Path '${exePath}') { Start-Process '${exePath}' } else { Start-Process 'Docker Desktop' }`,
        ],
        { windowsHide: true }
      );
      return true;
    } catch {
      return false;
    }
  } else if (process.platform === "darwin") {
    try {
      spawnSync("open", ["-a", "Docker"]);
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      spawnSync("sudo", ["systemctl", "start", "docker"]);
      return true;
    } catch {
      return false;
    }
  }
}

function ensureDockerRunning(maxWaitSeconds = 45) {
  if (isDockerDaemonReady()) {
    return true;
  }

  console.log("⚠ Docker daemon is not responding. Launching Docker Desktop...");
  startDockerDesktop();

  const startTime = Date.now();
  const timeoutMs = maxWaitSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    sleepMs(2500);
    if (isDockerDaemonReady()) {
      console.log("\n✓ Docker Desktop is ready.");
      return true;
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`   Waiting for Docker daemon to initialize... (${elapsed}s)\r`);
  }

  console.log("");
  console.error("✗ Docker daemon did not respond within timeout. Please check Docker Desktop.");
  return false;
}

async function main() {
  const { forceKill, checkOnly, ports } = parseArgs(process.argv.slice(2));

  let portMap = findListeningPids(ports);
  let rows = collectOccupants(portMap);

  if (rows.length > 0) {
    printOccupants(rows);

    const killableRows = rows.filter((r) => !r.isDocker);
    const dockerRows = rows.filter((r) => r.isDocker);

    if (checkOnly && killableRows.length > 0) {
      console.log("Use: npm run dev:kill   or   HRMS_DEV_KILL=1 npm run dev");
      process.exit(1);
    }

    if (killableRows.length > 0) {
      let shouldKill = forceKill;
      if (!shouldKill) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
          const promptMsg = `Kill non-Docker processes (${killableRows.length} tree(s)) and continue? [Y/n] (Press Enter for Yes): `;
          shouldKill = await askYesNo(promptMsg);
          if (!shouldKill) {
            console.error("Aborted. Free ports manually or run: npm run dev:kill");
            process.exit(1);
          }
        } else {
          console.error(
            "Non-interactive shell: ports busy. Run npm run dev:kill or set HRMS_DEV_KILL=1"
          );
          process.exit(1);
        }
      }

      const uniquePids = [...new Set(killableRows.map((r) => r.pid))];
      console.log(`Killing ${uniquePids.length} process tree(s) (Docker processes excluded)...`);
      for (const pid of uniquePids) {
        const ok = killTree(pid);
        console.log(ok ? `  ✓ tree PID ${pid}` : `  ✗ failed PID ${pid}`);
      }

      // Brief settle; re-check (orphans may rebind briefly)
      sleepMs(800);
      portMap = findListeningPids(ports);
      rows = collectOccupants(portMap);
      const remainingKillable = rows.filter((r) => !r.isDocker);

      if (remainingKillable.length > 0) {
        console.log("Still busy after kill — second pass...");
        for (const pid of new Set(remainingKillable.map((r) => r.pid))) {
          killTree(pid);
        }
        sleepMs(500);
        portMap = findListeningPids(ports);
        rows = collectOccupants(portMap);
      }

      const finalKillable = rows.filter((r) => !r.isDocker);
      if (finalKillable.length > 0) {
        printOccupants(finalKillable);
        console.error(
          "✗ Could not free all dev ports from non-Docker processes. Close them manually and retry."
        );
        process.exit(1);
      }
    }
  }

  console.log(`✓ Dev ports free: ${ports.map((p) => ":" + p).join(", ")}`);

  if (!checkOnly) {
    const dockerOk = ensureDockerRunning();
    if (!dockerOk) process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

