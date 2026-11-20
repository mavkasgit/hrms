#!/usr/bin/env node
// Проверка реестра инструментов гейта (docs/quality/tools.json).
//
// Правила (harness/rules/quality-gates.md §8):
//   - version совпадает с фактическим пином в файле pinned_in;
//   - runs_in — имя шага STEPS или слот pre-commit/pre-push/commit-msg/prove-checks/ci;
//   - шаг с полем tool обязан иметь запись в реестре;
//   - blocking, но ни шаг, ни хук его не запускает, — красный;
//   - reviewed старше 180 дней — warn, отсутствие пина — fail.
//
// Шаг ничего не правит: только читает и сравнивает. Фиксы — руками.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "./gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(ROOT, "docs/quality/tools.json");
const FRESH_DAYS = 180;
const HOOK_SLOTS = new Set(["pre-commit", "pre-push", "commit-msg", "prove-checks", "ci"]);
const KNOWN_STEPS = new Set(STEPS.map((step) => step.name));

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isFuture(value) {
  return Date.parse(`${value}T00:00:00Z`) > Date.now();
}

function isStale(value) {
  return Date.now() - Date.parse(`${value}T00:00:00Z`) > FRESH_DAYS * 86_400_000;
}

// Пины из `key = "value"` — по строке на ключ. Закомментированный инструмент
// не является пином и не должен попадать в сравнение.
function tomlPins(text) {
  const pins = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const match = line.match(/^\s*"?([A-Za-z0-9_.:@/-]+)"?\s*=\s*"([^"]+)"/);
    if (match) pins.set(match[1], match[2]);
  }
  return pins;
}

function jsonPins(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const pins = new Map();
  for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(data[key] || {})) pins.set(name, version);
  }
  for (const [name, version] of Object.entries(data.engines || {})) pins.set(name, version);
  return pins;
}

function main() {
  if (!fs.existsSync(REGISTRY)) {
    console.error("registry: docs/quality/tools.json не найден");
    process.exit(1);
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  } catch (error) {
    console.error(`registry: tools.json не разбирается: ${error.message}`);
    process.exit(1);
  }

  const problems = [];
  const warns = [];

  if (!isValidDate(registry.reviewed) || isFuture(registry.reviewed)) {
    problems.push("tools.json: reviewed — невалидная дата (нужен YYYY-MM-DD, не в будущем)");
  } else if (isStale(registry.reviewed)) {
    warns.push(`tools.json: обзор старше ${FRESH_DAYS} дней (${registry.reviewed}) — пересмотреть инструменты`);
  }

  const tools = Array.isArray(registry.tools) ? registry.tools : [];
  if (!tools.length) problems.push("tools.json: пустой список tools");
  const seen = new Set();

  for (const tool of tools) {
    const label = tool.name || "(без имени)";
    if (!tool.name) problems.push("tools.json: запись без name");
    else if (seen.has(tool.name)) problems.push(`tools.json: дубликат инструмента ${tool.name}`);
    else seen.add(tool.name);

    for (const field of ["version", "pinned_in", "source", "why"]) {
      if (typeof tool[field] !== "string" || !tool[field].trim()) {
        problems.push(`${label}: пустое поле ${field}`);
      }
    }
    if (typeof tool.blocking !== "boolean") problems.push(`${label}: blocking должен быть true/false`);
    if (!isValidDate(tool.reviewed) || isFuture(tool.reviewed)) {
      problems.push(`${label}: reviewed — невалидная дата (нужен YYYY-MM-DD, не в будущем)`);
    } else if (isStale(tool.reviewed)) {
      warns.push(`${label}: обзор старше ${FRESH_DAYS} дней (${tool.reviewed}) — подтвердить дату или заменить инструмент`);
    }

    const runsIn = Array.isArray(tool.runs_in) ? tool.runs_in : [];
    if (!runsIn.length) problems.push(`${label}: пустой runs_in — инструмент нигде не запускается`);
    for (const slot of runsIn) {
      if (!KNOWN_STEPS.has(slot) && !HOOK_SLOTS.has(slot)) {
        problems.push(`${label}: runs_in содержит неизвестное место запуска «${slot}»`);
      }
    }
    if (tool.blocking === true && !runsIn.some((slot) => KNOWN_STEPS.has(slot) || HOOK_SLOTS.has(slot))) {
      problems.push(`${label}: blocking, но ни шаг гейта, ни хук его не запускают`);
    }

    if (typeof tool.pinned_in !== "string" || !tool.pinned_in.trim()) continue;
    const pinFile = path.join(ROOT, tool.pinned_in);
    if (!fs.existsSync(pinFile)) {
      problems.push(`${label}: pinned_in «${tool.pinned_in}» не существует`);
      continue;
    }
    const key = tool.pinned_as || tool.name;
    let pins;
    try {
      pins = pinFile.endsWith(".json")
        ? jsonPins(pinFile)
        : tomlPins(fs.readFileSync(pinFile, "utf8"));
    } catch (error) {
      problems.push(`${label}: ${tool.pinned_in} не разбирается: ${error.message}`);
      continue;
    }
    const actual = pins.get(key);
    if (actual === undefined) problems.push(`${label}: в ${tool.pinned_in} нет пина «${key}»`);
    else if (actual !== tool.version) {
      problems.push(`${label}: version «${tool.version}» ≠ пин «${actual}» в ${tool.pinned_in}`);
    }
  }

  // Обратная сторона: шаг объявляет инструмент — реестр обязан его знать.
  for (const step of STEPS) {
    if (step.tool && !seen.has(step.tool)) {
      problems.push(`${step.name}: инструмент «${step.tool}» не описан в tools.json`);
    }
  }

  for (const warn of warns) console.warn(`warn: ${warn}`);
  if (problems.length) {
    for (const problem of problems.slice(0, 8)) console.error(`registry: ${problem}`);
    if (problems.length > 8) console.error(`registry: ... ещё ${problems.length - 8}`);
    process.exit(1);
  }
  console.log(`registry: ${tools.length} инструментов сверены с пинами${warns.length ? `, ${warns.length} warn` : ""}`);
}

main();
