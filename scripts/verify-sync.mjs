#!/usr/bin/env node
/**
 * Синк-гейт переносимых файлов между sibling-проектами HRMS/KTM.
 *
 * Сверяет файлы, помеченные в scripts/sync-manifest.json как must-match.
 * Синхронизация ручная: после правки общего файла агент переносит копию
 * в соседний проект и поднимает версию.
 *
 * Режимы сравнения (поле entry.mode):
 *   - content — байт-эквивалент, переводы строк (CRLF/LF) игнорируются;
 *   - version — совпадение констант *_VERSION (или поля "version" в JSON)
 *               из хостового файла директории (для файла — сам файл).
 * Поле entry.version:true добавляет к content-сравнению сверку версии.
 *
 * Запуск (из корня репозитория):
 *   node scripts/verify-sync.mjs --other ../hrms
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const SYNC_VERSION = "1.0.0"

const MANIFEST = "scripts/sync-manifest.json"
const HOST_NAMES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs"]
const MODES = new Set(["content", "version"])
const VERSION_RE = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*_VERSION)\s*=\s*["']([^"']+)["']/g

export function parseArgs(argv) {
  const args = { other: null, root: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--other" && argv[i + 1]) {
      args.other = argv[i + 1]
      i++
    } else if (argv[i] === "--root" && argv[i + 1]) {
      args.root = argv[i + 1]
      i++
    }
  }
  return args
}

export function normalize(content) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

export function extractVersions(content, filePath) {
  const versions = new Map()
  if (path.extname(filePath).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(content)
      if (typeof parsed?.version === "string") versions.set("version", parsed.version)
    } catch {
      // не JSON — версий нет
    }
    return versions
  }
  for (const match of content.matchAll(VERSION_RE)) versions.set(match[1], match[2])
  return versions
}

function hostFileFor(rel, root) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return null
  if (fs.statSync(abs).isFile()) return abs
  for (const name of HOST_NAMES) {
    const candidate = path.join(abs, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function compareVersions(fileA, fileB, rel) {
  const errors = []
  const a = normalize(fs.readFileSync(fileA, "utf8"))
  const b = normalize(fs.readFileSync(fileB, "utf8"))
  const va = extractVersions(a, fileA)
  const vb = extractVersions(b, fileB)
  const keys = new Set([...va.keys(), ...vb.keys()])
  if (keys.size === 0) {
    errors.push(`не найдены константы *_VERSION: ${rel}`)
    return errors
  }
  for (const key of keys) {
    if (va.get(key) !== vb.get(key)) {
      errors.push(
        `version mismatch: ожидалось ${va.get(key) ?? "—"}, у соседа ${vb.get(key) ?? "—"} (${rel}: ${key})`,
      )
    }
  }
  return errors
}

export function run({ root, otherRoot, manifestPath = MANIFEST }) {
  const manifestFile = path.join(root, manifestPath)
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  } catch (error) {
    return { ok: false, errors: [`Не удалось прочитать манифест: ${manifestFile} (${error.message})`], checked: 0 }
  }
  const entries = manifest.files
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, errors: [`манифест пуст или не содержит files: ${manifestFile}`], checked: 0 }
  }
  const errors = []
  let checked = 0

  for (const entry of entries) {
    const rel = entry.path
    const mode = entry.mode ?? "content"
    if (!MODES.has(mode)) {
      errors.push(`неизвестный режим сравнения: ${mode} (${rel})`)
      continue
    }
    const hereAbs = path.join(root, rel)
    const thereAbs = path.join(otherRoot, rel)
    if (!fs.existsSync(hereAbs)) {
      errors.push(`файл есть у соседа, но отсутствует здесь: ${rel}`)
      continue
    }
    if (!fs.existsSync(thereAbs)) {
      errors.push(`файл есть здесь, но отсутствует у соседа: ${rel}`)
      continue
    }
    if (mode === "version") {
      const hereHost = hostFileFor(rel, root)
      const thereHost = hostFileFor(rel, otherRoot)
      if (!hereHost || !thereHost) {
        errors.push(`не найден хостовый файл версии: ${rel}`)
        continue
      }
      errors.push(...compareVersions(hereHost, thereHost, rel))
      checked++
      continue
    }
    const a = normalize(fs.readFileSync(hereAbs, "utf8"))
    const b = normalize(fs.readFileSync(thereAbs, "utf8"))
    if (a !== b) {
      errors.push(`hash mismatch: файл изменён без поднятия версии: ${rel}`)
    }
    if (entry.version) errors.push(...compareVersions(hereAbs, thereAbs, rel))
    checked++
  }

  return { ok: errors.length === 0, errors, checked }
}

function main() {
  const { other, root: rootOverride } = parseArgs(process.argv.slice(2))
  if (!other) {
    console.error("Использование: node scripts/verify-sync.mjs --other <путь к sibling-проекту> [--root <корень репозитория>]")
    process.exit(2)
  }
  const root = rootOverride
    ? path.resolve(rootOverride)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const otherRoot = path.resolve(root, other)
  const result = run({ root, otherRoot })
  for (const error of result.errors) console.error(error)
  if (result.ok) {
    console.log(`Синк-гейт пройден: ${result.checked} файлов совпадают (${path.basename(otherRoot)}).`)
    process.exit(0)
  }
  console.error("Синк-гейт НЕ пройден.")
  process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
