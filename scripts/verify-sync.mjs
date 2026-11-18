#!/usr/bin/env node
/**
 * Синк-гейт переносимых файлов между sibling-проектами HRMS/KTM.
 *
 * Сверяет файлы, помеченные в scripts/sync-manifest.json как must-match.
 * Синхронизация ручная: после правки общего файла агент переносит копию
 * в соседний проект и поднимает версию.
 *
 * Режимы сравнения (поле entry.mode):
 *   - content  — байт-эквивалент, переводы строк (CRLF/LF) игнорируются;
 *   - version  — совпадение констант *_VERSION (или поля "version" в JSON)
 *                из хостового файла директории (для файла — сам файл);
 *   - presence — файл обязан существовать в обоих проектах, содержимое
 *                может различаться (хостовые файлы модулей, напр. ui.ts).
 * Поле entry.version:true добавляет к content-сравнению сверку версии.
 *
 * Запуск (из корня репозитория):
 *   node scripts/verify-sync.mjs --other ../ktm2000
 *   node scripts/verify-sync.mjs --other ../ktm2000 --if-enabled
 *   node scripts/verify-sync.mjs --other ../ktm2000 --baseline scripts/sync-baseline.json
 *
 * В автоматическом режиме (`--if-enabled`) проверка выполняется только при
 * HRMS_SYNCGATE=1|true|yes|on. Без переменной выход успешный, с неверном
 * значением — ошибка. Ручной запуск без флага проверяет всегда.
 *
 * Baseline (`--baseline <path>`): JSON `{ "entries": [{ "path", "reason" }] }`
 * с уже известными расхождениями. Запись из baseline печатается как `known`
 * и не валит гейт; новое расхождение — fail. `--strict` игнорирует baseline
 * (режим «долг закрыт»). Отсутствующий или битый baseline — exit 2.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const SYNC_VERSION = "1.2.0"

const MANIFEST = "scripts/sync-manifest.json"
const HOST_NAMES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs"]
const MODES = new Set(["content", "version", "presence"])
const VERSION_RE = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*_VERSION)\s*=\s*["']([^"']+)["']/g

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"])

export function parseArgs(argv) {
  const args = { other: null, root: null, ifEnabled: false, baseline: null, strict: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--other" && argv[i + 1]) {
      args.other = argv[i + 1]
      i++
    } else if (argv[i] === "--root" && argv[i + 1]) {
      args.root = argv[i + 1]
      i++
    } else if (argv[i] === "--baseline" && argv[i + 1]) {
      args.baseline = argv[i + 1]
      i++
    } else if (argv[i] === "--if-enabled") {
      args.ifEnabled = true
    } else if (argv[i] === "--strict") {
      args.strict = true
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

/**
 * Прочитать baseline. Возвращает `{ entries: Map(path → reason), stale: [] }`
 * или `{ error }`, если файла нет/JSON битый/запись без path.
 */
export function loadBaseline(file) {
  let text
  try {
    text = fs.readFileSync(file, "utf8")
  } catch (error) {
    return { error: `baseline не найден или не читается: ${file} (${error.code ?? error.message})` }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { error: `baseline не парсится как JSON: ${file} (${error.message})` }
  }
  if (!Array.isArray(parsed?.entries)) {
    return { error: `baseline должен содержать массив entries: ${file}` }
  }
  const entries = new Map()
  for (const [index, entry] of parsed.entries.entries()) {
    if (typeof entry?.path !== "string" || entry.path.trim() === "") {
      return { error: `baseline: запись #${index} без path: ${file}` }
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      return { error: `baseline: запись #${index} (${entry.path}) без reason: ${file}` }
    }
    entries.set(entry.path, entry.reason)
  }
  return { entries }
}

export function run({ root, otherRoot, manifestPath = MANIFEST, baselinePath = null, strict = false }) {
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

  let baseline = null
  if (baselinePath) {
    const file = path.isAbsolute(baselinePath) ? baselinePath : path.resolve(root, baselinePath)
    const loaded = loadBaseline(file)
    if (loaded.error) return { ok: false, exitCode: 2, errors: [loaded.error], checked: 0 }
    baseline = loaded.entries
  }

  const findings = []
  let checked = 0

  for (const entry of entries) {
    const rel = entry.path
    const mode = entry.mode ?? "content"
    if (!MODES.has(mode)) {
      findings.push({ path: rel, message: `неизвестный режим сравнения: ${mode} (${rel})` })
      continue
    }
    const hereAbs = path.join(root, rel)
    const thereAbs = path.join(otherRoot, rel)
    if (!fs.existsSync(hereAbs)) {
      findings.push({ path: rel, message: `файл есть у соседа, но отсутствует здесь: ${rel}` })
      continue
    }
    if (!fs.existsSync(thereAbs)) {
      findings.push({ path: rel, message: `файл есть здесь, но отсутствует у соседа: ${rel}` })
      continue
    }
    if (mode === "presence") {
      checked++
      continue
    }
    if (mode === "version") {
      const hereHost = hostFileFor(rel, root)
      const thereHost = hostFileFor(rel, otherRoot)
      if (!hereHost || !thereHost) {
        findings.push({ path: rel, message: `не найден хостовый файл версии: ${rel}` })
        continue
      }
      for (const message of compareVersions(hereHost, thereHost, rel)) {
        findings.push({ path: rel, message })
      }
      checked++
      continue
    }
    const a = normalize(fs.readFileSync(hereAbs, "utf8"))
    const b = normalize(fs.readFileSync(thereAbs, "utf8"))
    if (a !== b) {
      findings.push({ path: rel, message: `hash mismatch: файл изменён без поднятия версии: ${rel}` })
    }
    if (entry.version) {
      for (const message of compareVersions(hereAbs, thereAbs, rel)) {
        findings.push({ path: rel, message })
      }
    }
    checked++
  }

  const known = []
  const errors = []
  for (const finding of findings) {
    const reason = baseline && !strict ? baseline.get(finding.path) : undefined
    if (reason) known.push({ ...finding, reason })
    else errors.push(finding.message)
  }
  const stale = baseline && !strict
    ? [...baseline.keys()].filter((p) => !findings.some((f) => f.path === p))
    : []

  return {
    ok: errors.length === 0,
    errors,
    known,
    stale,
    checked,
    baseline: baselinePath ? path.isAbsolute(baselinePath) ? baselinePath : path.resolve(root, baselinePath) : null,
  }
}

function main() {
  const { other, root: rootOverride, ifEnabled, baseline, strict } = parseArgs(process.argv.slice(2))
  if (!other) {
    console.error(
      "Использование: node scripts/verify-sync.mjs --other <путь к sibling-проекту> [--root <корень репозитория>] [--if-enabled] [--baseline <path>] [--strict]",
    )
    process.exit(2)
  }
  if (ifEnabled) {
    const value = process.env.HRMS_SYNCGATE
    if (value === undefined) {
      console.log("Синк-гейт отключён (HRMS_SYNCGATE не установлен).")
      process.exit(0)
    }
    const normalized = value.trim().toLowerCase()
    if (!ENABLED_VALUES.has(normalized)) {
      console.error(
        `Недопустимое значение HRMS_SYNCGATE=${JSON.stringify(value)}. Используйте одно из: 1, true, yes, on.`,
      )
      process.exit(2)
    }
  }
  const root = rootOverride
    ? path.resolve(rootOverride)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const otherRoot = path.resolve(root, other)
  const result = run({
    root,
    otherRoot,
    baselinePath: baseline,
    strict,
  })
  if (result.exitCode === 2) {
    for (const error of result.errors) console.error(error)
    process.exit(2)
  }
  for (const known of result.known ?? []) {
    console.log(`known: ${known.path} — ${known.reason}`)
  }
  for (const stale of result.stale ?? []) {
    console.log(`baseline устарел: ${stale} — расхождение закрыто, уберите запись из baseline.`)
  }
  for (const error of result.errors) console.error(error)
  if (result.ok) {
    const suppressed = result.known?.length ? `, ${result.known.length} известных` : ""
    console.log(
      `Синк-гейт пройден: ${result.checked} файлов сверено${suppressed} (${path.basename(otherRoot)}).`,
    )
    process.exit(0)
  }
  console.error("Синк-гейт НЕ пройден.")
  process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
