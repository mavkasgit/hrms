#!/usr/bin/env node
// prove-checks: каждый записанный шаг должен уметь падать на реальном нарушении.
//
// Для каждой записи docs/quality/proven-checks.json скрипт применяет конкретную
// поломку, запускает ровно этот шаг гейта, требует `fail` (а не `missing`),
// возвращает дерево в исходное состояние и сверяет `git status --porcelain`
// с состоянием до прогона. Незакоммиченная работа не теряется: файлы
// восстанавливаются из побайтовых бэкапов, а не через git checkout.
//
//   node scripts/prove-checks.mjs            # доказать всё
//   node scripts/prove-checks.mjs --only docs-sync,modern-web
//   node scripts/prove-checks.mjs --dry-run  # показать план
//   node scripts/prove-checks.mjs --json

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "./gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = path.join(ROOT, "docs/quality/proven-checks.json");
const MAX_AGE_DAYS = 180;

function reportOk(message) {
  console.log(`prove-checks: ok — ${message}`);
}

function reportFail(message) {
  console.error(`prove-checks: ${message}`);
}

function parseArgs(argv) {
  const opts = { only: null, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--only") {
      opts.only = argv[++i]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: node scripts/prove-checks.mjs [--only a,b] [--dry-run] [--json]",
      );
      process.exit(0);
    }
  }
  return opts;
}

function withinRepo(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  return absolute === ROOT || absolute.startsWith(ROOT + path.sep);
}

function porcelain() {
  const result = spawnSync("git", ["status", "--porcelain", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
  return (result.stdout ?? "")
    .split("\0")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function snapshot(absolute) {
  if (!fs.existsSync(absolute)) return { existed: false };
  const stat = fs.statSync(absolute);
  return {
    existed: true,
    bytes: fs.readFileSync(absolute),
    atime: stat.atime,
    mtime: stat.mtime,
  };
}

/** Применить поломку, запомнив исходное состояние затронутых файлов. */
function applyOps(ops, backups, label) {
  for (const op of ops ?? []) {
    const [kind, spec] = Object.entries(op)[0];
    const relative = spec.path;
    if (!relative || !withinRepo(relative)) {
      throw new Error(`${label}: путь вне репозитория: ${relative}`);
    }
    const absolute = path.join(ROOT, relative);
    if (!backups.has(absolute)) backups.set(absolute, snapshot(absolute));

    if (kind === "write") {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, spec.content, "utf8");
      continue;
    }
    if (kind === "remove") {
      fs.rmSync(absolute, { force: true, recursive: true });
      continue;
    }
    if (kind === "replace") {
      const original = fs.readFileSync(absolute, "utf8");
      let find = spec.find;
      let replace = spec.replace;
      if (!original.includes(find)) {
        const crlf = (value) => value.replace(/\r?\n/g, "\r\n");
        if (original.includes(crlf(find))) {
          find = crlf(find);
          replace = crlf(replace);
        }
      }
      if (!original.includes(find)) {
        throw new Error(`${label}: не найдено ${JSON.stringify(spec.find)} в ${relative}`);
      }
      fs.writeFileSync(absolute, original.replace(find, replace), "utf8");
      continue;
    }
    throw new Error(`${label}: неизвестная операция «${kind}»`);
  }
}

function restoreOps(backups) {
  for (const [absolute, before] of backups) {
    if (before.existed) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, before.bytes);
      fs.utimesSync(absolute, before.atime, before.mtime);
    } else {
      fs.rmSync(absolute, { force: true, recursive: true });
    }
  }
}

/** Запустить ровно один шаг гейта и вернуть его машинный статус. */
function runStep(stepName) {
  const result = spawnSync(
    process.execPath,
    ["scripts/gate.mjs", "--only", stepName, "--json"],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout ?? "");
  } catch {
    return {
      status: "unparsed",
      detail: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    };
  }
  const step = parsed.steps?.find((item) => item.name === stepName);
  return { status: step?.status ?? "unparsed", exitCode: result.status };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(RECORD)) {
    reportFail("docs/quality/proven-checks.json отсутствует");
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(RECORD, "utf8"));
  } catch (error) {
    reportFail(`proven-checks.json не парсится: ${error.message}`);
    process.exit(2);
  }
  // Контракт — { steps, exempt }; старый массив записей тоже читаем.
  const proofs = Array.isArray(parsed) ? parsed : parsed?.steps;
  const exempt = Array.isArray(parsed?.exempt) ? parsed.exempt : [];
  if (!Array.isArray(proofs)) {
    reportFail("proven-checks.json должен содержать steps (массив) или быть массивом записей");
    process.exit(2);
  }

  const stepNames = new Set(STEPS.map((step) => step.name));
  const baseline = porcelain();
  const failures = [];
  const results = [];

  for (const entry of exempt) {
    const label = entry?.step ?? "<без step>";
    if (!stepNames.has(entry?.step)) {
      failures.push(`exempt ${label}: шага нет в STEPS`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      failures.push(`exempt ${label}: без reason — исключение без причины не считается`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? "")) {
      failures.push(`exempt ${label}: expires должен быть YYYY-MM-DD`);
    }
  }

  for (const proof of proofs) {
    if (opts.only && !opts.only.includes(proof.step)) continue;
    const label = proof.step ?? "<без step>";

    if (!stepNames.has(proof.step)) {
      failures.push(`${label}: шага нет в STEPS — доказательство ссылается на несуществующую защиту`);
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proof.reviewed ?? "")) {
      failures.push(`${label}: reviewed должен быть YYYY-MM-DD`);
    } else {
      const age = (Date.now() - new Date(`${proof.reviewed}T00:00:00Z`).getTime()) / 86_400_000;
      if (age > MAX_AGE_DAYS) {
        console.log(`prove-checks: ! ${label}: доказательство не пересматривали ${Math.floor(age)} дней`);
      }
    }

    if (opts.dryRun) {
      console.log(`prove-checks: plan ${label} — ${proof.violation}`);
      continue;
    }

    const backups = new Map();
    let outcome;
    try {
      applyOps(proof.apply, backups, label);
      outcome = runStep(proof.step);
    } finally {
      restoreOps(backups);
    }

    const residue = porcelain().filter((line) => !baseline.includes(line));
    if (outcome.status !== "fail") {
      failures.push(
        `${label}: шаг не упал на нарушении «${proof.violation}» (статус ${outcome.status})` +
          (outcome.detail ? `\n${outcome.detail.slice(-2000)}` : ""),
      );
    } else if (residue.length) {
      failures.push(`${label}: дерево не вернулось в исходное состояние: ${residue.join(", ")}`);
    } else {
      results.push({ step: label, violation: proof.violation, status: "fail" });
    }
  }

  if (opts.dryRun) return;

  if (opts.json) {
    console.log(JSON.stringify({ proved: results, failures }, null, 2));
  } else {
    for (const result of results) {
      console.log(`prove-checks: ✔ ${result.step} — ${result.violation}`);
    }
  }

  if (failures.length) {
    for (const failure of failures) reportFail(failure);
    process.exit(1);
  }
  reportOk(
    `${results.length} шагов падают на реальном нарушении; ${exempt.length} exempt с причиной и датой`,
  );
}

main();
