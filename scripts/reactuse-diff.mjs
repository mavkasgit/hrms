#!/usr/bin/env node
// Дифф-ратчет ReactUse: краснеет только на НОВЫХ ручных примитивах в изменённых
// строках, а не на всём дереве. Базовая линия не нужна: старый код не трогаем.
//
// Почему дифф, а не baseline: 70+ существующих вхождений — это не долг, который
// надо чинить в один PR, а фон. Гейт должен ловить «опять написали свой
// matchMedia», а не требовать переписать проект.
//
// Осознанное исключение — комментарий в той же строке:
//   const mql = window.matchMedia('(max-width: 600px)') // reactuse-ok: Safari 12
//
// Использование:
//   node scripts/reactuse-diff.mjs                     # база: upstream, иначе HEAD
//   node scripts/reactuse-diff.mjs --base origin/main
//   node scripts/reactuse-diff.mjs --json
//
// CI: база берётся из GITHUB_BASE_REF. Локально: @{u} (upstream текущей ветки),
// иначе HEAD — то есть незакоммиченные правки.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RULES = [
  { id: "intersection-observer", re: /\bnew\s+IntersectionObserver\s*\(/, hook: "useIntersectionObserver" },
  { id: "resize-observer", re: /\bnew\s+ResizeObserver\s*\(/, hook: "useResizeObserver" },
  { id: "media-query", re: /\bmatchMedia\s*\(/, hook: "useMediaQuery" },
  { id: "clipboard", re: /\bnavigator\.clipboard\b/, hook: "useClipboard / useCopy" },
  { id: "document-title", re: /\bdocument\.title\s*=/, hook: "useDocumentTitle" },
  { id: "document-visibility", re: /\bdocument\.visibilityState\b/, hook: "useDocumentVisibility" },
  { id: "fullscreen", re: /\.requestFullscreen\s*\(/, hook: "useFullscreen" },
  { id: "online", re: /\bnavigator\.onLine\b/, hook: "useOnline" },
  { id: "online-listener", re: /addEventListener\(\s*["']online["']/, hook: "useOnline" },
  { id: "websocket", re: /\bnew\s+WebSocket\s*\(/, hook: "useWebSocket" },
];

const SKIP_FILE = /(^|\/)(node_modules|dist|build|coverage)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const ALLOW = /reactuse-ok\b/;

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function parseArgs(argv) {
  const out = { base: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base" && argv[i + 1]) out.base = argv[++i];
    else if (argv[i] === "--json") out.json = true;
  }
  return out;
}

/** Грубо убрать комментарии: шаг не должен ругаться на слово в JSDoc. */
function codeOnly(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("*/")) {
    return "";
  }
  return line
    .replace(/\/\*.*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/, "$1");
}

function resolveBase(explicit) {
  if (explicit) return explicit;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  const up = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (up.ok && up.out) return up.out;
  // Ветка без upstream: сравниваем с точкой ветвления от main/master.
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    const mb = git(["merge-base", ref, "HEAD"]);
    if (mb.ok && mb.out) return mb.out;
  }
  return "HEAD";
}

/** Разобрать unified diff -U0 и вернуть добавленные строки с номерами. */
function addedLines(diff) {
  const files = [];
  let current = null;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      current = { file: line.slice(6), lines: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (m) {
      current.newLine = Number(m[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ line: current.newLine, text: line.slice(1) });
      current.newLine += 1;
    }
  }
  return files;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = resolveBase(args.base);

  const diff = git(["diff", "-U0", base, "--", "frontend/src"]);
  if (!diff.ok) {
    console.error(`reactuse-diff: git diff ${base} не удался: ${diff.err || "?"}`);
    process.exit(2);
  }

  const findings = [];
  for (const file of addedLines(diff.out)) {
    if (SKIP_FILE.test(file.file.replace(/\\/g, "/"))) continue;
    for (const added of file.lines) {
      if (!added.text.trim() || ALLOW.test(added.text)) continue;
      const code = codeOnly(added.text);
      if (!code.trim()) continue;
      for (const rule of RULES) {
        if (rule.re.test(code)) {
          findings.push({ file: file.file, line: added.line, rule: rule.id, hook: rule.hook, text: added.text.trim() });
          break;
        }
      }
    }
  }

  // Неотслеживаемые файлы: git diff их не видит, а до коммита они самые опасные.
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "frontend/src"]);
  if (untracked.ok && untracked.out) {
    for (const file of untracked.out.split(/\r?\n/).filter(Boolean)) {
      if (SKIP_FILE.test(file.replace(/\\/g, "/"))) continue;
      let text = "";
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      text.split(/\r?\n/).forEach((lineText, index) => {
        if (!lineText.trim() || ALLOW.test(lineText)) return;
        const code = codeOnly(lineText);
        if (!code.trim()) return;
        for (const rule of RULES) {
          if (rule.re.test(code)) {
            findings.push({ file, line: index + 1, rule: rule.id, hook: rule.hook, text: lineText.trim() });
            break;
          }
        }
      });
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ status: findings.length ? "fail" : "ok", base, findings }, null, 2));
  } else if (findings.length) {
    console.error(`reactuse-diff: ${findings.length} новых ручных примитивов (база ${base})`);
    for (const f of findings) {
      console.error(`  + ${f.file}:${f.line}  ${f.rule} → ${f.hook}`);
    }
    console.error("  возьми хук из @siberiacancode/reactuse или пометь строку // reactuse-ok: <причина>");
  } else {
    console.log(`reactuse-diff: ok — новых ручных примитивов нет (база ${base})`);
  }

  process.exit(findings.length ? 1 : 0);
}

main();
