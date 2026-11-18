#!/usr/bin/env node
// Один вход в качество. `npm run gate` — CI, `npm run gate:fast` — pre-push и
// `mise run check`, `npm run gate:e2e` — отдельный стенд.
//
// Ярусы накопительные:
//   fast — статика по всему репозиторию, офлайн          бюджет: 60 с
//   gate — fast + vitest + pytest (изолированная БД)
//   e2e  — gate + Playwright smoke, нужен живой стенд
//
// Шаг — это данные, а не проза: `name` — ключ для docs/quality/gates.md
// (сверяется scripts/check-docs.mjs), `what` — что сломается без него.
//
// Гейт ничего не правит: никаких --fix/--write/stage_fixed здесь нет и не будет.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const FAST_BUDGET_MS = 60_000;

/**
 * @typedef {object} Step
 * @property {string} name        stable id; обязан совпадать со строкой карты защит
 * @property {"fast"|"gate"|"e2e"} tier
 * @property {string} what        что ломается, если шаг убрать
 * @property {string[]} [also]    другие точки, где живёт та же защита (колонка карты)
 * @property {string} cmd
 * @property {string[]} args
 * @property {string} [bin]       исполняемый файл, наличие которого проверяем
 * @property {string} [cwd]       относительно корня репозитория
 * @property {Record<string,string>} [env]
 * @property {string[]} [requires] URL, которые должны отвечать до запуска
 * @property {number[]} [missingExitCodes] коды, означающие «не проверено», а не «сломано»
 * @property {number} [timeout]
 */

/** @type {Step[]} */
export const STEPS = [
  // ── fast: целостность и политики ─────────────────────────────────────────
  {
    name: "docs-sync",
    tier: "fast",
    what: "шаг в STEPS без строки в docs/quality/gates.md или строка без шага",
    also: ["CI test-backend: npm run check:docs"],
    cmd: "node",
    args: ["scripts/check-docs.mjs"],
  },
  {
    name: "verify-profile-settings",
    tier: "fast",
    what: "манифест версии ядра профиля разошёлся с кодом (strict)",
    also: ["CI test-backend (strict)"],
    cmd: "python",
    args: ["scripts/verify-profile-settings.py", "verify", "--strict"],
    bin: "python",
  },
  {
    name: "reactuse-diff",
    tier: "fast",
    what: "новый ручной примитив (matchMedia, observers, clipboard) вместо @siberiacancode/reactuse",
    also: ["mise run reactuse-diff"],
    cmd: "node",
    args: ["scripts/reactuse-diff.mjs"],
  },
  {
    name: "modern-web",
    tier: "fast",
    what: "новый legacy-паттерн веб-платформы сверх docs/quality/modern-web-baseline.json",
    also: ["mise run modern-web"],
    cmd: "node",
    args: ["scripts/modern-web.mjs"],
    // 2 = сканер недоступен (сеть/пакет): это missing, а не регресс кода.
    missingExitCodes: [2],
    timeout: 180_000,
  },

  // ── fast: frontend ───────────────────────────────────────────────────────
  {
    name: "frontend-types",
    tier: "fast",
    what: "ошибка типов TypeScript (tsc -b)",
    cmd: "npm",
    args: ["--prefix", "frontend", "run", "typecheck"],
    timeout: 300_000,
  },
  {
    name: "frontend-build",
    tier: "fast",
    what: "production-сборка frontend (vite build) падает",
    cmd: "npm",
    args: ["--prefix", "frontend", "run", "build"],
    timeout: 600_000,
  },

  // ── gate: тестовые наборы ────────────────────────────────────────────────
  {
    name: "frontend-unit",
    tier: "gate",
    what: "регрессия frontend (vitest)",
    also: ["mise run test"],
    cmd: "npm",
    args: ["--prefix", "frontend", "run", "test"],
    timeout: 600_000,
  },
  {
    name: "backend-tests",
    tier: "gate",
    what: "регрессия backend (pytest, своя изолированная БД)",
    also: ["CI test-backend.yml"],
    cmd: "npm",
    args: ["run", "test:pytest"],
    timeout: 900_000,
  },

  // ── e2e: нужен живой стенд ───────────────────────────────────────────────
  {
    name: "e2e-smoke",
    tier: "e2e",
    what: "сломан пользовательский путь (Playwright smoke)",
    also: ["CI e2e-smoke.yml"],
    cmd: "npm",
    args: ["run", "test:e2e:smoke"],
    requires: ["http://127.0.0.1:8011/api/health", "http://localhost:5171/"],
    timeout: 900_000,
  },
];

const TIER_ORDER = { fast: 0, gate: 1, e2e: 2 };

function parseArgs(argv) {
  const opts = {
    tier: "gate",
    only: null,
    list: false,
    strict: false,
    json: false,
    doctor: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tier") opts.tier = argv[++i];
    else if (arg === "--fast") opts.tier = "fast";
    else if (arg === "--e2e") opts.tier = "e2e";
    else if (arg === "--only") {
      opts.only = argv[++i]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === "--list") opts.list = true;
    else if (arg === "--strict") opts.strict = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--doctor") opts.doctor = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: node scripts/gate.mjs [--tier fast|gate|e2e] [--only a,b] [--list] [--strict] [--json] [--doctor]",
      );
      process.exit(0);
    }
  }
  if (!(opts.tier in TIER_ORDER)) {
    console.error(`gate: неизвестный ярус «${opts.tier}» (fast|gate|e2e)`);
    process.exit(2);
  }
  return opts;
}

function colorize(code, text) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const c = {
  bold: (text) => colorize("1", text),
  dim: (text) => colorize("2", text),
  green: (text) => colorize("32", text),
  yellow: (text) => colorize("33", text),
  red: (text) => colorize("31", text),
};

function which(bin) {
  const result = spawnSync(IS_WIN ? "where" : "which", [bin], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

/** Команда запуска: node — текущий процесс, npm — через cmd.exe на Windows. */
export function commandFor(step) {
  if (step.cmd === "node") return { cmd: process.execPath, args: step.args };
  if (step.cmd === "npm") {
    if (IS_WIN) {
      return {
        cmd: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "npm", ...step.args],
      };
    }
    return { cmd: "npm", args: step.args };
  }
  if (step.bin && !which(step.bin)) return null;
  return { cmd: step.cmd, args: step.args };
}

async function reachable(url, timeoutMs = 1500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function selected(step, opts) {
  if (opts.only) return opts.only.includes(step.name);
  return TIER_ORDER[step.tier] <= TIER_ORDER[opts.tier];
}

function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function tail(text, lines = 40) {
  const all = text.split(/\r?\n/);
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

async function runStep(step) {
  if (step.requires) {
    for (const url of step.requires) {
      if (!(await reachable(url))) {
        return {
          status: "missing",
          ms: 0,
          output: `${url} не отвечает — подними стенд (npm run dev / test-env-up)`,
        };
      }
    }
  }
  const command = commandFor(step);
  if (!command) {
    return {
      status: "missing",
      ms: 0,
      output: `${step.bin ?? step.cmd} не найден в PATH`,
    };
  }
  const startedAt = Date.now();
  const result = spawnSync(command.cmd, command.args, {
    cwd: step.cwd ? path.join(ROOT, step.cwd) : ROOT,
    env: { ...process.env, ...step.env },
    encoding: "utf8",
    windowsHide: true,
    timeout: step.timeout ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - startedAt;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) {
    return { status: "missing", ms, output: result.error.message };
  }
  if (result.status === 0) return { status: "ok", ms, output };
  if (step.missingExitCodes?.includes(result.status)) {
    return { status: "missing", ms, output };
  }
  return { status: "fail", ms, output };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    for (const step of STEPS) {
      console.log(`${step.tier.padEnd(4)} ${step.name.padEnd(24)} ${step.what}`);
    }
    return;
  }
  if (opts.doctor) {
    runDoctor();
    return;
  }

  const steps = STEPS.filter((step) => selected(step, opts));
  if (steps.length === 0) {
    console.error("gate: ни один шаг не выбран");
    process.exitCode = 2;
    return;
  }

  const startedAt = Date.now();
  if (!opts.json) {
    console.log(`${c.bold("gate")} tier=${opts.tier} steps=${steps.length}`);
  }

  const results = [];
  for (const step of steps) {
    const outcome = await runStep(step);
    results.push({ name: step.name, tier: step.tier, ...outcome });
    if (opts.json) continue;
    const label = `${String(results.length).padStart(2)}/${String(steps.length).padEnd(2)} ${step.name}`;
    if (outcome.status === "ok") {
      console.log(`${c.green("✔")} ${label.padEnd(40)} ${c.dim(formatMs(outcome.ms))}`);
    } else if (outcome.status === "missing") {
      console.log(`${c.yellow("?")} ${label.padEnd(40)} ${c.dim("missing")}`);
      if (outcome.output) console.log(tail(outcome.output, 5).replace(/^/gm, "   "));
    } else {
      console.log(`${c.red("✖")} ${label.padEnd(40)} ${c.dim(formatMs(outcome.ms))}`);
      if (outcome.output) console.log(tail(outcome.output).replace(/^/gm, "   "));
    }
  }

  const elapsed = Date.now() - startedAt;
  const failed = results.filter((result) => result.status === "fail");
  const missing = results.filter((result) => result.status === "missing");
  const budget = opts.tier === "fast" ? FAST_BUDGET_MS : null;
  const overBudget = Boolean(budget && elapsed > budget);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          tier: opts.tier,
          elapsedMs: elapsed,
          budgetMs: budget,
          steps: results.map(({ output, ...rest }) => rest),
          passed: results.length - failed.length - missing.length,
          failed: failed.length,
          missing: missing.length,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("");
    console.log(
      `${c.bold("summary")} ${results.length - failed.length - missing.length}/${results.length} passed in ${formatMs(elapsed)}` +
        (budget ? ` (budget ${formatMs(budget)})` : ""),
    );
    if (failed.length) console.log(c.red(`failed: ${failed.map((r) => r.name).join(", ")}`));
    if (missing.length) console.log(c.yellow(`missing: ${missing.map((r) => r.name).join(", ")}`));
    if (overBudget) {
      console.log(
        c.yellow(`fast превысил бюджет: ${formatMs(elapsed)} > ${formatMs(budget)}`) +
          " — ускорь шаг или перенеси его в gate/e2e, не поднимай лимит",
      );
    }
  }

  if (failed.length) process.exitCode = 1;
  if (opts.strict && (missing.length || overBudget)) process.exitCode = 1;
}

function runDoctor() {
  console.log(c.bold("doctor"));
  const bins = ["node", "npm", "python", "docker", "git"];
  for (const bin of bins) {
    console.log(`  ${which(bin) ? c.green("✔") : c.red("✖")} ${bin}`);
  }
  const runtimes = [
    ["node", process.versions.node],
    ["python", runVersion("python", ["--version"])],
  ];
  for (const [name, version] of runtimes) {
    console.log(`  ${c.dim("·")} ${name} ${version || "?"}`);
  }
  const docs = spawnSync(process.execPath, ["scripts/check-docs.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  console.log(`  ${docs.status === 0 ? c.green("✔") : c.red("✖")} docs-sync`);
  if (docs.status !== 0) process.exitCode = 1;
  const dirty = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  if ((dirty.stdout ?? "").trim()) {
    console.log(c.yellow("  ! рабочее дерево грязное — prove-checks вернёт его как было, но полный прогон лучше на чистом"));
  }
}

function runVersion(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return (result.stdout || result.stderr || "").trim().replace(/^Python\s+/i, "");
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
