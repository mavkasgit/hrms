#!/usr/bin/env node
// Держит карту защит честной: набор шагов между маркерами в docs/quality/gates.md
// обязан совпадать с STEPS из scripts/gate.mjs (имя, ярус и колонка «Где ещё живёт»).
//
// Шаг без строки в карте невидим; строка без шага — обещание, которого нет.
// И то и другое — красный.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "./gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC = path.join(ROOT, "docs/quality/gates.md");
const START = "<!-- gate-steps:start -->";
const END = "<!-- gate-steps:end -->";

function reportOk(message) {
  console.log(`docs-sync: ok — ${message}`);
}

function reportFail(message) {
  console.error(`docs-sync: ${message}`);
}

function expectedAlso(step) {
  return step.also?.length ? step.also.join(", ") : "—";
}

function parseDoc(text, errors) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    errors.push(`docs/quality/gates.md: не найдены маркеры ${START} … ${END}`);
    return new Map();
  }
  const block = text.slice(start + START.length, end);
  const rows = new Map();
  for (const line of block.split(/\r?\n/)) {
    // | `name` | tier | what | also | blocks | proof |
    const match = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/.exec(
      line,
    );
    if (!match) continue;
    const [, name, tier, , also] = match;
    if (rows.has(name)) errors.push(`docs/quality/gates.md: шаг \`${name}\` описан дважды`);
    rows.set(name, { tier: tier.trim(), also: also.trim() });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(DOC)) {
    reportFail("docs/quality/gates.md отсутствует");
    process.exit(1);
  }

  const errors = [];
  const documented = parseDoc(fs.readFileSync(DOC, "utf8"), errors);
  const code = new Map(STEPS.map((step) => [step.name, step]));

  for (const [name, step] of code) {
    const row = documented.get(name);
    if (!row) {
      errors.push(`шаг \`${name}\` (${step.tier}) есть в STEPS, но не в карте защит`);
      continue;
    }
    if (row.tier !== step.tier) {
      errors.push(`шаг \`${name}\`: ярус в карте «${row.tier}», в коде «${step.tier}»`);
    }
    const expected = expectedAlso(step);
    if (row.also !== expected) {
      errors.push(
        `шаг \`${name}\`: колонка «Где ещё живёт» в карте «${row.also}», из STEPS «${expected}»`,
      );
    }
  }

  for (const name of documented.keys()) {
    if (!code.has(name)) errors.push(`карта защит обещает шаг \`${name}\`, которого нет в STEPS`);
  }

  if (errors.length) {
    for (const error of errors) reportFail(error);
    console.error("   исправьте docs/quality/gates.md или STEPS в scripts/gate.mjs");
    process.exit(1);
  }
  reportOk(`${code.size} шагов совпадают с картой защит`);
}

main();
