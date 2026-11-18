#!/usr/bin/env node
// Ратчет modern-web-guidance: legacy-scan против зафиксированного базлайна.
//
// Зачем обёртка: `legacy-scan` возвращает exit 0 даже с находками, поэтому как
// шаг гейта он бесполезен напрямую. Здесь — сравнение с базлайном по паре
// (правило, файл): новая находка — красный, исправление — зелёный.
//
// Счётчик по файлу, а не по строке: номера строк ездят после любого рефакторинга,
// и базлайн на `file:line` краснел бы от посторонних правок.
//
// Использование:
//   node scripts/modern-web.mjs                 # проверка (exit 1 при регрессе)
//   node scripts/modern-web.mjs --update        # осознанно обновить базлайн
//   node scripts/modern-web.mjs --json          # машинный вывод для CI
//   node scripts/modern-web.mjs --include-docs-and-tests
//   node scripts/modern-web.mjs --target frontend --root .
//
// Сканер не пинуется намеренно: решение владельца — не критично, если новая
// версия покраснеет. Версия печатается в отчёте, чтобы регресс был объясним.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BASELINE_REL = "docs/quality/modern-web-baseline.json";

function parseArgs(argv) {
  const out = { update: false, json: false, includeDocs: false, target: "frontend", root: dirname(SCRIPT_DIR) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--update") out.update = true;
    else if (a === "--json") out.json = true;
    else if (a === "--include-docs-and-tests") out.includeDocs = true;
    else if (a === "--target" && argv[i + 1]) out.target = argv[++i];
    else if (a === "--root" && argv[i + 1]) out.root = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const ROOT = resolve(args.root);
const TARGET = resolve(ROOT, args.target);
const BASELINE = join(ROOT, BASELINE_REL);

function toPosix(p) {
  return p.replace(/\\/g, "/");
}

function warn(msg) {
  console.error(`modern-web: ${msg}`);
}

/** Запустить сканер и вернуть разобранный JSON. null — сканер недоступен/сломан. */
function scan() {
  // Одна строка + shell: Node сам обернёт её в cmd /c. Массив аргументов с shell
  // даёт DeprecationWarning, а прямой spawn npx.cmd — EINVAL, поэтому строка.
  const cmdline = ["npx", "--yes", "modern-web-guidance@latest", "legacy-scan", `"${TARGET}"`, "--json"]
    .concat(args.includeDocs ? ["--include-docs-and-tests"] : [])
    .join(" ");
  const r = spawnSync(cmdline, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (r.error) {
    warn(`не удалось запустить сканер: ${r.error.message}`);
    return null;
  }
  if (r.status !== 0) {
    warn(`сканер завершился с кодом ${r.status}`);
    if (r.stderr) warn(r.stderr.trim().split("\n").slice(-5).join("\n"));
    return null;
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    warn("сканер вернул не JSON (вероятно, сетевая ошибка npx)");
    return null;
  }
}

/** Мультимножество находок: ключ (правило + файл) -> количество. */
function normalize(data) {
  const map = new Map();
  for (const guide of data.guides ?? []) {
    for (const rule of guide.rules ?? []) {
      const ruleKey = `${guide.guideId}/${rule.ruleId}`;
      for (const f of rule.findings ?? []) {
        const file = toPosix(relative(ROOT, resolve(TARGET, f.file)));
        const key = `${ruleKey}\t${file}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
  }
  return map;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch {
    warn(`базлайн ${BASELINE_REL} не парсится`);
    return null;
  }
}

function saveBaseline(map, data) {
  const findings = [...map.entries()]
    .map(([key, count]) => {
      const [rule, file] = key.split("\t");
      return { rule, file, count };
    })
    .sort((a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file));

  const doc = {
    reviewed: new Date().toISOString().slice(0, 10),
    scanner: "modern-web-guidance",
    target: toPosix(relative(ROOT, TARGET)) || ".",
    total: data.totalFindings ?? 0,
    findings,
  };
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return doc;
}

function main() {
  if (!existsSync(TARGET)) {
    warn(`цель не найдена: ${toPosix(relative(ROOT, TARGET))}`);
    process.exit(2);
  }

  const data = scan();
  if (!data) {
    // Сканер недоступен (сеть/пакет). Это не регресс кода, но и не «проверено».
    warn("шаг не выполнен — считай это missing, а не зелёным");
    process.exit(2);
  }

  const actual = normalize(data);
  const baseline = loadBaseline();

  if (args.update || !baseline) {
    if (!baseline && !args.update) {
      warn(`базлайн отсутствует: ${BASELINE_REL}`);
      warn("первый запуск фиксирует текущее состояние: повтори с --update осознанно");
      process.exit(2);
    }
    const doc = saveBaseline(actual, data);
    if (args.json) console.log(JSON.stringify({ status: "updated", ...doc }, null, 2));
    else console.log(`modern-web: базлайн записан — ${doc.total} находок в ${doc.findings.length} парах (правило, файл)`);
    return;
  }

  const baselineMap = new Map((baseline.findings ?? []).map((f) => [`${f.rule}\t${f.file}`, f.count]));
  const regressions = [];
  for (const [key, count] of actual) {
    const was = baselineMap.get(key) ?? 0;
    if (count > was) {
      const [rule, file] = key.split("\t");
      regressions.push({ rule, file, was, now: count });
    }
  }

  const total = data.totalFindings ?? 0;
  const baselineTotal = baseline.total ?? 0;

  if (regressions.length > 0) {
    if (args.json) {
      console.log(JSON.stringify({ status: "fail", total, baselineTotal, regressions }, null, 2));
    } else {
      console.error(`modern-web: ${regressions.length} новых находок (было ${baselineTotal}, стало ${total})`);
      for (const r of regressions) {
        console.error(`  + ${r.rule}  ${r.file}  (${r.was} → ${r.now})`);
      }
      console.error("  исправь или, если это осознанное решение, обнови базлайн: node scripts/modern-web.mjs --update");
    }
    process.exit(1);
  }

  const improved = baselineTotal - total;
  if (args.json) {
    console.log(JSON.stringify({ status: "ok", total, baselineTotal, improved }, null, 2));
  } else {
    const hint = improved > 0 ? `, −${improved}: можно опустить базлайн через --update` : "";
    console.log(`modern-web: ok — ${total} находок, базлайн ${baselineTotal}${hint}`);
  }
}

main();
