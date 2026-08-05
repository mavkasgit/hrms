#!/usr/bin/env node
/**
 * Сверка переносимых модулей между приложениями семейства (HRMS/KTM).
 *
 * Гарантирует «единый стиль»: копии модулей в двух репозиториях должны
 * совпадать, за исключением хостовых файлов:
 *   - ui.ts    — импорты shadcn-примитивов своего приложения;
 *   - index.ts — константы версий.
 * Переводы строк игнорируются (CRLF vs LF) — сравнение нормализованное.
 *
 * Запуск (из frontend/): node scripts/check-modules.mjs --other <путь к frontend/ соседнего репо>
 */
import fs from "node:fs"
import path from "node:path"

const MODULES_DIR = "src/modules"
const HOST_FILES = new Set(["ui.ts", "index.ts"])
const VERSION_RE = /const\s+([A-Z_]+_VERSION)\s*=\s*"([^"]+)"/g

function parseArgs(argv) {
  const args = { other: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--other" && argv[i + 1]) {
      args.other = argv[i + 1]
      i++
    }
  }
  return args
}

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(abs))
    else out.push(abs)
  }
  return out
}

function relFiles(modDir) {
  return walk(modDir).map((f) => path.relative(modDir, f))
}

function normalize(content) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function listModules(root) {
  const dir = path.join(root, MODULES_DIR)
  if (!fs.existsSync(dir)) return new Map()
  const map = new Map()
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) map.set(name, full)
  }
  return map
}

function firstDiffLine(a, b) {
  const al = a.split("\n")
  const bl = b.split("\n")
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) {
      return { line: i + 1, left: al[i] ?? "(нет строки)", right: bl[i] ?? "(нет строки)" }
    }
  }
  return null
}

function readVersions(indexFile) {
  const out = new Map()
  if (!fs.existsSync(indexFile)) return out
  const content = fs.readFileSync(indexFile, "utf8")
  for (const match of content.matchAll(VERSION_RE)) {
    out.set(match[1], match[2])
  }
  return out
}

const { other } = parseArgs(process.argv.slice(2))
if (!other) {
  console.error(
    "Использование: node scripts/check-modules.mjs --other <путь к frontend/ соседнего репо>",
  )
  process.exit(2)
}

const cwd = process.cwd()
const otherRoot = path.resolve(cwd, other)
const hereModulesDir = path.join(cwd, MODULES_DIR)
const thereModulesDir = path.join(otherRoot, MODULES_DIR)
if (!fs.existsSync(hereModulesDir)) {
  console.error(`Не найдена папка модулей здесь: ${hereModulesDir}`)
  process.exit(1)
}
if (!fs.existsSync(thereModulesDir)) {
  console.error(`Не найдена папка модулей в соседнем репо: ${thereModulesDir}`)
  process.exit(1)
}
const here = listModules(cwd)
const there = listModules(otherRoot)

let failed = false

for (const name of [...new Set([...here.keys(), ...there.keys()])].sort()) {
  const hereDir = here.get(name)
  const thereDir = there.get(name)
  if (!hereDir) {
    console.error(`МОДУЛЬ ${name}: есть в соседнем (${other}), но отсутствует здесь.`)
    failed = true
    continue
  }
  if (!thereDir) {
    console.error(`МОДУЛЬ ${name}: есть здесь, но отсутствует в соседнем (${other}).`)
    failed = true
    continue
  }

  // Наличие сверяем по всем файлам, включая хостовые (ui.ts/index.ts):
  // их содержимое может различаться, но они обязаны существовать в обеих копиях.
  const hereAll = new Set(relFiles(hereDir))
  const thereAll = new Set(relFiles(thereDir))

  for (const file of hereAll) {
    if (!thereAll.has(file)) {
      console.error(`МОДУЛЬ ${name}: файл только здесь — ${file}`)
      failed = true
    }
  }
  for (const file of thereAll) {
    if (!hereAll.has(file)) {
      console.error(`МОДУЛЬ ${name}: файл только в соседнем — ${file}`)
      failed = true
    }
  }

  // Содержимое сравниваем только у нехостовых файлов.
  for (const file of hereAll) {
    if (HOST_FILES.has(file) || !thereAll.has(file)) continue
    const a = normalize(fs.readFileSync(path.join(hereDir, file), "utf8"))
    const b = normalize(fs.readFileSync(path.join(thereDir, file), "utf8"))
    if (a === b) continue
    const diff = firstDiffLine(a, b)
    console.error(`МОДУЛЬ ${name}: файл отличается — ${file}`)
    if (diff) {
      console.error(`  строка ${diff.line}:`)
      console.error(`  - ${diff.left}`)
      console.error(`  + ${diff.right}`)
    }
    failed = true
  }

  const vHere = readVersions(path.join(hereDir, "index.ts"))
  const vThere = readVersions(path.join(thereDir, "index.ts"))
  for (const key of new Set([...vHere.keys(), ...vThere.keys()])) {
    if (vHere.get(key) !== vThere.get(key)) {
      console.error(
        `МОДУЛЬ ${name}: версия ${key} различается — здесь ${vHere.get(key) ?? "—"}, сосед ${vThere.get(key) ?? "—"}`,
      )
      failed = true
    }
  }
}

if (failed) {
  console.error("Модули НЕ синхронизированы.")
  process.exit(1)
} else {
  console.log("Модули синхронизированы: одинаковые копии в обоих приложениях.")
}
