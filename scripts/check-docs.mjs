#!/usr/bin/env node
// Держит карту защит честной. Между маркерами в docs/quality/gates.md набор
// шагов обязан совпадать с STEPS из scripts/gate.mjs (имя, ярус, CI), а у
// каждого шага должно быть доказательство: запись в docs/quality/proven-checks.json
// либо явный exempt с причиной и датой пересмотра.
//
// Шаг без строки в карте невидим; строка без шага — обещание, которого нет;
// шаг без доказательства — зелёная галочка без права краснеть. Всё это — красный.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "./gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC = path.join(ROOT, "docs/quality/gates.md");
const PROVEN = path.join(ROOT, "docs/quality/proven-checks.json");
const START = "<!-- gate-steps:start -->";
const END = "<!-- gate-steps:end -->";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function reportOk(message) {
  console.log(`docs-sync: ok — ${message}`);
}

function reportFail(message) {
  console.error(`docs-sync: ${message}`);
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
    // | `name` | tier | what | ci | blocks | proof |
    const match = /^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);
    if (!match) continue;
    const [, name, tier, what, ci, blocks, proof] = match;
    if (rows.has(name)) errors.push(`docs/quality/gates.md: шаг \`${name}\` описан дважды`);
    rows.set(name, {
      tier: tier.trim(),
      what: what.trim(),
      ci: ci.trim(),
      blocks: blocks.trim(),
      proof: proof.trim().replace(/`/g, ""),
    });
  }
  return rows;
}

/** Доказательства: записи в proven-checks.json и явные исключения с датой. */
function readProofs(errors) {
  const empty = { proven: new Map(), exempt: new Map() };
  if (!fs.existsSync(PROVEN)) {
    errors.push("docs/quality/proven-checks.json отсутствует — доказательств нет ни у одного шага");
    return empty;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(PROVEN, "utf8"));
  } catch (error) {
    errors.push(`proven-checks.json не парсится: ${error.message}`);
    return empty;
  }
  // Поддерживаем и старый массив записей, и контракт { steps, exempt }.
  const proofs = Array.isArray(parsed) ? parsed : parsed?.steps;
  if (!Array.isArray(proofs)) {
    errors.push("proven-checks.json: ожидается массив записей или объект { steps, exempt }");
    return empty;
  }
  const exemptList = Array.isArray(parsed?.exempt) ? parsed.exempt : [];

  const proven = new Map();
  for (const proof of proofs) {
    if (typeof proof?.step !== "string" || proof.step.trim() === "") {
      errors.push("proven-checks.json: запись без step");
      continue;
    }
    if (!DATE_RE.test(proof.reviewed ?? "")) {
      errors.push(`proven-checks.json: у \`${proof.step}\` reviewed должен быть YYYY-MM-DD`);
    }
    if (proven.has(proof.step)) {
      errors.push(`proven-checks.json: шаг \`${proof.step}\` доказан дважды`);
    }
    proven.set(proof.step, proof);
  }

  const exempt = new Map();
  for (const entry of exemptList) {
    if (typeof entry?.step !== "string" || entry.step.trim() === "") {
      errors.push("proven-checks.json: exempt без step");
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      errors.push(`proven-checks.json: exempt \`${entry.step}\` без reason`);
    }
    if (!DATE_RE.test(entry.reviewed ?? "")) {
      errors.push(`proven-checks.json: exempt \`${entry.step}\`: reviewed должен быть YYYY-MM-DD`);
    }
    if (!DATE_RE.test(entry.expires ?? "")) {
      errors.push(`proven-checks.json: exempt \`${entry.step}\`: expires должен быть YYYY-MM-DD`);
    }
    if (exempt.has(entry.step)) {
      errors.push(`proven-checks.json: \`${entry.step}\` в exempt дважды`);
    }
    exempt.set(entry.step, entry);
  }

  return { proven, exempt };
}

function main() {
  if (!fs.existsSync(DOC)) {
    reportFail("docs/quality/gates.md отсутствует");
    process.exit(1);
  }

  const errors = [];
  const documented = parseDoc(fs.readFileSync(DOC, "utf8"), errors);
  const code = new Map(STEPS.map((step) => [step.name, step]));
  const { proven, exempt } = readProofs(errors);

  for (const [name, step] of code) {
    if (typeof step.ci !== "string" || step.ci.trim() === "") {
      errors.push(`шаг \`${name}\`: поле ci обязательно (workflow или \`npm run gate\`)`);
    }
    const row = documented.get(name);
    if (!row) {
      errors.push(`шаг \`${name}\` (${step.tier}) есть в STEPS, но не в карте защит`);
      continue;
    }
    if (row.tier !== step.tier) {
      errors.push(`шаг \`${name}\`: ярус в карте «${row.tier}», в коде «${step.tier}»`);
    }
    if (row.ci !== step.ci) {
      errors.push(`шаг \`${name}\`: CI в карте «${row.ci}», из STEPS «${step.ci}»`);
    }

    const hasProof = proven.has(name);
    const hasExempt = exempt.has(name);
    if (hasProof && hasExempt) {
      errors.push(`шаг \`${name}\`: одновременно доказательство и exempt — выберите одно`);
      continue;
    }
    if (!hasProof && !hasExempt) {
      errors.push(
        `шаг \`${name}\`: нет доказательства — добавьте запись в proven-checks.json ` +
          "или exempt с reason, reviewed и expires",
      );
      continue;
    }
    if (hasProof) {
      const expected = `proven-checks.json#${name}`;
      if (row.proof !== expected) {
        errors.push(`шаг \`${name}\`: колонка «Доказано падает» «${row.proof}», ожидается «${expected}»`);
      }
    } else if (!/^exempt\b/.test(row.proof)) {
      errors.push(
        `шаг \`${name}\`: в карте «${row.proof}», а в proven-checks.json — exempt (нужно «exempt: причина»)`,
      );
    }
  }

  for (const name of documented.keys()) {
    if (!code.has(name)) errors.push(`карта защит обещает шаг \`${name}\`, которого нет в STEPS`);
  }
  for (const name of [...proven.keys(), ...exempt.keys()]) {
    if (!code.has(name)) {
      errors.push(`proven-checks.json ссылается на шаг \`${name}\`, которого нет в STEPS`);
    }
  }

  if (errors.length) {
    for (const error of errors) reportFail(error);
    console.error("   исправьте docs/quality/gates.md, docs/quality/proven-checks.json или STEPS в scripts/gate.mjs");
    process.exit(1);
  }
  reportOk(
    `${code.size} шагов совпадают с картой; доказательства: ${proven.size} записей, ${exempt.size} exempt`,
  );
}

main();
