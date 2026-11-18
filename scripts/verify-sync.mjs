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
 *   node scripts/verify-sync.mjs --other ../ktm2000 --baseline scripts/sync-baseline.json --write-baseline
 *
 * В автоматическом режиме (`--if-enabled`) проверка выполняется только при
 * HRMS_SYNCGATE=1|true|yes|on. Без переменной выход успешный, с неверном
 * значением — ошибка. Ручной запуск без флага проверяет всегда.
 *
 * Baseline (`--baseline <path>`): JSON
 *   { "entries": [{ "path", "kind", "hash", "reason", "reviewed", "expires" }] }
 * где `kind` — режим сравнения (content|version|presence), `hash` — sha256
 * нормализованного локального файла на момент снимка (для presence —
 * sentinel `sentinel:presence`), `reviewed`/`expires` — даты пересмотра долга.
 *
 * Baseline подавляет расхождение только при совпадении path + kind + hash.
 * Файл, изменившийся после снимка, — это новое ухудшение на известном пути,
 * и оно валит гейт. `--strict` игнорирует baseline («долг закрыт»).
 * `--write-baseline` пересобирает файл по текущим расхождениям, сохраняя
 * reason/reviewed/expires известных записей; для нового расхождения reason
 * нужно добавить в baseline руками — молчаливой записи долга нет.
 * Отсутствующий или битый baseline — exit 2.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const SYNC_VERSION = "1.3.0"

export const PRESENCE_HASH = "sentinel:presence"
export const ABSENT_HASH = "sentinel:absent"
export const DEFAULT_EXPIRES = "2027-06-30"

const MANIFEST = "scripts/sync-manifest.json"
const HOST_NAMES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs"]
const MODES = new Set(["content", "version", "presence"])
const VERSION_RE = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*_VERSION)\s*=\s*["']([^"']+)["']/g
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"])

export function parseArgs(argv) {
  const args = {
    other: null,
    root: null,
    ifEnabled: false,
    baseline: null,
    strict: false,
    writeBaseline: false,
  }
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
    } else if (argv[i] === "--write-baseline") {
      args.writeBaseline = true
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

export function textHash(content) {
  return `sha256:${crypto.createHash("sha256").update(normalize(content)).digest("hex")}`
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

/**
 * Отпечаток локальной стороны на момент снимка. Сравнивается вместе с path и
 * kind: подавляется ровно тот долг, который записали, а не любой на этом пути.
 */
export function hashFor(entry, rel, root) {
  const mode = entry.mode ?? "content"
  if (mode === "presence") return PRESENCE_HASH
  if (mode === "version") {
    const host = hostFileFor(rel, root)
    return host ? textHash(fs.readFileSync(host, "utf8")) : ABSENT_HASH
  }
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return ABSENT_HASH
  return textHash(fs.readFileSync(abs, "utf8"))
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

export function baselineKey(entry) {
  return `${entry.path}\u0000${entry.kind}\u0000${entry.hash}`
}

/**
 * Прочитать baseline. Возвращает `{ entries }` или `{ error }`, если файла
 * нет/JSON битый/запись неполная. Дата пересмотра обязательна: у долга без
 * срока нет владельца.
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
  const entries = []
  const seen = new Set()
  for (const [index, entry] of parsed.entries.entries()) {
    const label = `baseline: запись #${index}${typeof entry?.path === "string" ? ` (${entry.path})` : ""}`
    if (typeof entry?.path !== "string" || entry.path.trim() === "") {
      return { error: `${label} без path: ${file}` }
    }
    if (typeof entry.kind !== "string" || !MODES.has(entry.kind)) {
      return { error: `${label}: kind должен быть одним из ${[...MODES].join("|")}: ${file}` }
    }
    if (typeof entry.hash !== "string" || entry.hash.trim() === "") {
      return { error: `${label} без hash (sha256 локального файла на момент снимка): ${file}` }
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      return { error: `${label} без reason: ${file}` }
    }
    if (!DATE_RE.test(entry.reviewed ?? "")) {
      return { error: `${label}: reviewed должен быть YYYY-MM-DD: ${file}` }
    }
    if (!DATE_RE.test(entry.expires ?? "")) {
      return { error: `${label}: expires должен быть YYYY-MM-DD: ${file}` }
    }
    const key = baselineKey(entry)
    if (seen.has(key)) return { error: `${label}: дубль path+kind+hash: ${file}` }
    seen.add(key)
    entries.push({
      path: entry.path,
      kind: entry.kind,
      hash: entry.hash,
      reason: entry.reason,
      reviewed: entry.reviewed,
      expires: entry.expires,
    })
  }
  return { entries }
}

/** Собрать текущие расхождения: path + kind + hash на каждом. */
export function collect({ root, otherRoot, manifestPath = MANIFEST }) {
  const manifestFile = path.join(root, manifestPath)
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  } catch (error) {
    return { error: `Не удалось прочитать манифест: ${manifestFile} (${error.message})`, checked: 0 }
  }
  const entries = manifest.files
  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: `манифест пуст или не содержит files: ${manifestFile}`, checked: 0 }
  }

  const findings = []
  let checked = 0
  const add = (rel, kind, hash, message) => findings.push({ path: rel, kind, hash, message })

  for (const entry of entries) {
    const rel = entry.path
    const mode = entry.mode ?? "content"
    if (!MODES.has(mode)) {
      add(rel, "unknown", ABSENT_HASH, `неизвестный режим сравнения: ${mode} (${rel})`)
      continue
    }
    const hereAbs = path.join(root, rel)
    const thereAbs = path.join(otherRoot, rel)
    const hash = hashFor(entry, rel, root)
    if (!fs.existsSync(hereAbs)) {
      add(rel, mode, hash, `файл есть у соседа, но отсутствует здесь: ${rel}`)
      continue
    }
    if (!fs.existsSync(thereAbs)) {
      add(rel, mode, hash, `файл есть здесь, но отсутствует у соседа: ${rel}`)
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
        add(rel, mode, hash, `не найден хостовый файл версии: ${rel}`)
        continue
      }
      for (const message of compareVersions(hereHost, thereHost, rel)) {
        add(rel, mode, hash, message)
      }
      checked++
      continue
    }
    const a = normalize(fs.readFileSync(hereAbs, "utf8"))
    const b = normalize(fs.readFileSync(thereAbs, "utf8"))
    if (a !== b) {
      add(rel, mode, hash, `hash mismatch: файл изменён без поднятия версии: ${rel}`)
    }
    if (entry.version) {
      for (const message of compareVersions(hereAbs, thereAbs, rel)) {
        add(rel, mode, hash, message)
      }
    }
    checked++
  }

  return { findings, checked }
}

export function run({ root, otherRoot, manifestPath = MANIFEST, baselinePath = null, strict = false }) {
  const collected = collect({ root, otherRoot, manifestPath })
  if (collected.error) {
    return { ok: false, errors: [collected.error], checked: 0 }
  }

  let baseline = null
  if (baselinePath) {
    const file = path.isAbsolute(baselinePath) ? baselinePath : path.resolve(root, baselinePath)
    const loaded = loadBaseline(file)
    if (loaded.error) return { ok: false, exitCode: 2, errors: [loaded.error], checked: 0 }
    baseline = loaded.entries
  }

  const active = baseline && !strict ? baseline : null
  const byKey = new Map((active ?? []).map((entry) => [baselineKey(entry), entry]))
  const today = new Date().toISOString().slice(0, 10)

  const known = []
  const errors = []
  for (const finding of collected.findings) {
    const match = byKey.get(baselineKey(finding))
    if (match) {
      known.push({ ...finding, reason: match.reason, expires: match.expires })
      continue
    }
    const samePath = (active ?? []).filter((entry) => entry.path === finding.path)
    if (samePath.length) {
      const was = samePath
        .map((entry) => `${entry.kind}/${entry.hash}`)
        .join(", ")
      errors.push(
        `${finding.message} — baseline на этом пути больше не действует ` +
          `(было ${was}, стало ${finding.kind}/${finding.hash}): это новое ухудшение на известном пути`,
      )
      continue
    }
    errors.push(finding.message)
  }

  const findingKeys = new Set(collected.findings.map((finding) => baselineKey(finding)))
  const stale = (active ?? [])
    .filter((entry) => !findingKeys.has(baselineKey(entry)))
    .map((entry) => entry.path)
  const expired = (active ?? [])
    .filter((entry) => entry.expires < today)
    .map((entry) => `${entry.path} (expires ${entry.expires})`)

  return {
    ok: errors.length === 0,
    errors,
    known,
    stale,
    expired,
    checked: collected.checked,
    baseline: baselinePath
      ? path.isAbsolute(baselinePath)
        ? baselinePath
        : path.resolve(root, baselinePath)
      : null,
  }
}

/**
 * Пересобрать baseline по текущим расхождениям. Reason/reviewed/expires
 * известных записей сохраняются; для нового расхождения reason обязателен
 * (иначе запись долга была бы молчаливой).
 */
export function writeBaselineFile({
  root,
  otherRoot,
  manifestPath = MANIFEST,
  baselinePath,
  expires = DEFAULT_EXPIRES,
}) {
  const collected = collect({ root, otherRoot, manifestPath })
  if (collected.error) return { ok: false, errors: [collected.error] }

  const file = path.isAbsolute(baselinePath) ? baselinePath : path.resolve(root, baselinePath)
  const existing = []
  if (fs.existsSync(file)) {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"))
    } catch (error) {
      return { ok: false, errors: [`baseline не парсится как JSON: ${file} (${error.message})`] }
    }
    // Пересборка читает и старый формат (path+reason): она и есть миграция.
    for (const entry of Array.isArray(parsed?.entries) ? parsed.entries : []) {
      if (typeof entry?.path !== "string" || typeof entry?.reason !== "string") continue
      existing.push({
        path: entry.path,
        kind: MODES.has(entry.kind) ? entry.kind : null,
        hash: typeof entry.hash === "string" ? entry.hash : null,
        reason: entry.reason,
        reviewed: DATE_RE.test(entry.reviewed ?? "") ? entry.reviewed : null,
        expires: DATE_RE.test(entry.expires ?? "") ? entry.expires : null,
      })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const byKey = new Map(existing.map((entry) => [baselineKey(entry), entry]))
  const byPath = new Map()
  for (const entry of existing) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, entry)
  }

  const written = new Map()
  const errors = []
  for (const finding of collected.findings) {
    const key = baselineKey(finding)
    if (written.has(key)) continue
    const previous = byKey.get(key) ?? byPath.get(finding.path)
    if (!previous) {
      errors.push(
        `нет reason для нового расхождения: ${finding.path} (${finding.kind}/${finding.hash}) — ` +
          `добавьте запись в baseline вручную, долг не заводится молча`,
      )
      continue
    }
    written.set(key, {
      path: finding.path,
      kind: finding.kind,
      hash: finding.hash,
      reason: previous.reason,
      reviewed: previous.reviewed ?? today,
      expires: previous.expires ?? expires,
    })
  }

  if (errors.length) return { ok: false, errors }

  const entries = [...written.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind),
  )
  fs.writeFileSync(file, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8")
  return { ok: true, file, written: entries.length }
}

function main() {
  const { other, root: rootOverride, ifEnabled, baseline, strict, writeBaseline } = parseArgs(
    process.argv.slice(2),
  )
  if (!other) {
    console.error(
      "Использование: node scripts/verify-sync.mjs --other <путь к sibling-проекту> [--root <корень репозитория>] [--if-enabled] [--baseline <path>] [--strict] [--write-baseline]",
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

  if (writeBaseline) {
    if (!baseline) {
      console.error("--write-baseline требует --baseline <path>: какой файл пересобирать.")
      process.exit(2)
    }
    const result = writeBaselineFile({ root, otherRoot, baselinePath: baseline })
    if (!result.ok) {
      for (const error of result.errors) console.error(error)
      console.error("baseline не пересобран.")
      process.exit(1)
    }
    console.log(`baseline пересобран: ${result.written} записей → ${result.file}`)
    console.log("Проверьте diff: изменённый hash — это осознанно принятый новый долг, а не подавление.")
    process.exit(0)
  }

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
    console.log(
      `known: ${known.path} — ${known.reason} (${known.kind}, ${known.hash}, до ${known.expires})`,
    )
  }
  for (const stale of result.stale ?? []) {
    console.log(`baseline устарел: ${stale} — расхождение закрыто, уберите запись из baseline.`)
  }
  for (const expired of result.expired ?? []) {
    console.log(`baseline просрочен: ${expired} — пересмотрите долг или закройте его.`)
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
