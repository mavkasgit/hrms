import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptsDir, "..")
const repositoryRoot = path.resolve(frontendRoot, "..")
const verifierPath = path.join(repositoryRoot, "scripts", "verify-sync.mjs")
const rootPackagePath = path.join(repositoryRoot, "package.json")
const frontendPackagePath = path.join(frontendRoot, "package.json")
const temporaryDirectories = []

function createWorkspace() {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "hrms-syncgate-"))
  temporaryDirectories.push(temporaryDirectory)

  const root = path.join(temporaryDirectory, "hrms")
  const sibling = path.join(temporaryDirectory, "ktm2000")
  mkdirSync(path.join(root, "scripts"), { recursive: true })
  copyFileSync(verifierPath, path.join(root, "scripts", "verify-sync.mjs"))

  return { root, sibling }
}

function writeFixtureFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, "utf8")
}

function createSyncFixture({ siblingContent } = {}) {
  const workspace = createWorkspace()
  copyFileSync(rootPackagePath, path.join(workspace.root, "package.json"))

  writeFixtureFile(
    workspace.root,
    "scripts/sync-manifest.json",
    JSON.stringify({
      version: "1.0.0",
      files: [{ path: "shared/sync.txt", mode: "content" }],
    }),
  )
  writeFixtureFile(workspace.root, "shared/sync.txt", "host content\n")
  writeBaseline(workspace, [])
  if (siblingContent !== undefined) {
    writeFixtureFile(workspace.sibling, "shared/sync.txt", siblingContent)
  }

  return workspace
}

function writeBaseline(workspace, entries) {
  writeFixtureFile(
    workspace.root,
    "scripts/sync-baseline.json",
    `${JSON.stringify({ entries }, null, 2)}\n`,
  )
}

function childEnvironment(syncGateValue) {
  const environment = Object.fromEntries(
    Object.entries({ ...process.env, NO_COLOR: "1" }).filter(
      ([key]) => key.toUpperCase() !== "HRMS_SYNCGATE",
    ),
  )
  if (syncGateValue !== undefined) {
    environment.HRMS_SYNCGATE = syncGateValue
  }
  return environment
}

function runCommand(command, args, cwd, environment) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
  })
  if (result.error) throw result.error
  return result
}

function runVerifier(workspace, args, syncGateValue) {
  return runCommand(
    process.execPath,
    [
      verifierPath,
      "--root",
      workspace.root,
      "--other",
      "../ktm2000",
      ...args,
    ],
    workspace.root,
    childEnvironment(syncGateValue),
  )
}

function runNpm(args, cwd, environment) {
  if (process.platform === "win32") {
    return runCommand(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", "npm", ...args],
      cwd,
      environment,
    )
  }
  return runCommand("npm", args, cwd, environment)
}

function expectRealMismatch(result) {
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("hash mismatch:")
  expect(result.stderr).toContain("Синк-гейт НЕ пройден.")
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true })
  }
})

describe("verify-sync CLI", () => {
  it("пропускает проверку без HRMS_SYNCGATE, не обращаясь к sibling-проекту", () => {
    const workspace = createSyncFixture()

    const result = runVerifier(workspace, ["--if-enabled"], undefined)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Синк-гейт отключён (HRMS_SYNCGATE не установлен).")
    expect(result.stderr).not.toContain("Синк-гейт НЕ пройден.")
  })

  it.each([
    ["1 с пробелами", " 1 "],
    ["true в верхнем регистре и с trim", " TRUE "],
    ["yes в смешанном регистре и с переводом строки", "\tYeS\n"],
    ["on в верхнем регистре", "ON"],
  ])("распознаёт --if-enabled и выполняет проверку для %s", (_case, value) => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })

    const result = runVerifier(workspace, ["--if-enabled"], value)

    expectRealMismatch(result)
  })

  it.each([
    ["пустого значения", ""],
    ["значения 0", "0"],
    ["неизвестного значения", "enabled"],
  ])("возвращает exit 2 и допустимые значения для %s", (_case, value) => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })

    const result = runVerifier(workspace, ["--if-enabled"], value)

    expect(result.status).toBe(2)
    expect(result.stderr).toContain(`Недопустимое значение HRMS_SYNCGATE=${JSON.stringify(value)}`)
    expect(result.stderr).toContain("Используйте одно из: 1, true, yes, on.")
  })

  it("ручной npm run verify:sync игнорирует HRMS_SYNCGATE и всегда проверяет файлы", () => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })

    const result = runNpm(
      ["run", "verify:sync"],
      workspace.root,
      childEnvironment("enabled"),
    )

    expectRealMismatch(result)
    expect(result.stderr).not.toContain("Недопустимое значение HRMS_SYNCGATE")
  })
})

describe("verify-sync baseline", () => {
  const knownEntry = {
    path: "shared/sync.txt",
    reason: "auth/OIDC debt (retro 2026-11-18)",
  }

  it("подавляет известное расхождение и печатает его как known", () => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })
    writeBaseline(workspace, [knownEntry])

    const result = runVerifier(
      workspace,
      ["--baseline", "scripts/sync-baseline.json"],
      undefined,
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("known: shared/sync.txt")
    expect(result.stdout).toContain(knownEntry.reason)
    expect(result.stderr).not.toContain("Синк-гейт НЕ пройден.")
  })

  it("краснеет на расхождении, которого нет в baseline", () => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })
    writeBaseline(workspace, [
      { path: "shared/another.txt", reason: "auth/OIDC debt (retro 2026-11-18)" },
    ])

    const result = runVerifier(
      workspace,
      ["--baseline", "scripts/sync-baseline.json"],
      undefined,
    )

    expectRealMismatch(result)
    expect(result.stderr).toContain("shared/sync.txt")
  })

  it("возвращает exit 2, если baseline не парсится", () => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })
    writeFixtureFile(workspace.root, "scripts/sync-baseline.json", "{ not json")

    const result = runVerifier(
      workspace,
      ["--baseline", "scripts/sync-baseline.json"],
      undefined,
    )

    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/baseline/i)
  })

  it("возвращает exit 2, если файл baseline отсутствует", () => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })
    rmSync(path.join(workspace.root, "scripts", "sync-baseline.json"), { force: true })

    const result = runVerifier(
      workspace,
      ["--baseline", "scripts/sync-baseline.json"],
      undefined,
    )

    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/baseline/i)
  })

  it("--strict игнорирует baseline и краснеет на известном расхождении", () => {
    const workspace = createSyncFixture({ siblingContent: "sibling content\n" })
    writeBaseline(workspace, [knownEntry])

    const result = runVerifier(
      workspace,
      ["--baseline", "scripts/sync-baseline.json", "--strict"],
      undefined,
    )

    expectRealMismatch(result)
    expect(result.stderr).toContain("shared/sync.txt")
    expect(result.stdout).not.toContain("known: shared/sync.txt")
  })
})

describe("Syncgate lifecycle prebuild gates", () => {
  it("npm run prebuild успешно пропускает проверку без sibling-проекта", () => {
    const workspace = createWorkspace()
    copyFileSync(rootPackagePath, path.join(workspace.root, "package.json"))

    const result = runNpm(
      ["run", "prebuild"],
      workspace.root,
      childEnvironment(undefined),
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Синк-гейт отключён (HRMS_SYNCGATE не установлен).")
    expect(result.stderr).not.toContain("Синк-гейт НЕ пройден.")
  })

  it("frontend npm run prebuild успешно пропускает проверку без sibling-проекта", () => {
    const workspace = createWorkspace()
    const temporaryFrontend = path.join(workspace.root, "frontend")
    mkdirSync(temporaryFrontend, { recursive: true })
    copyFileSync(frontendPackagePath, path.join(temporaryFrontend, "package.json"))

    const result = runNpm(
      ["--prefix", "frontend", "run", "prebuild"],
      workspace.root,
      childEnvironment(undefined),
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Синк-гейт отключён (HRMS_SYNCGATE не установлен).")
    expect(result.stderr).not.toContain("Синк-гейт НЕ пройден.")
  })
})
