#!/usr/bin/env python3
"""
verify-profile-settings — верификация канона модуля настроек профиля.

Сверяет sha256 «ядра» модуля user-settings и общих бэкенд-файлов профиля с
JSON-манифестом (scripts/profile-settings-manifest.json). HRMS — источник
правды; KTM получает свою копию манифеста и сверяет свою копию модуля.

Команды:
  verify           — пересчитать хеши ядра, сверить с манифестом, показать
                     расхождения поимённо (мягко, exit 0).
  verify --strict  — то же, но exit 1 при любом расхождении (для CI).
  sync             — перегенерировать хеши + поднять семантическую версию.
  version          — показать текущую версию в репо.

Ядро (хешируется): UserSettingsDialog, панели (Profile/Appearance/Security/
Sessions), AvatarPickerDialog, AvatarArt, types.ts, context.tsx, lib/*,
i18n/ru.ts, общие бэкенд-файлы профиля.
Исключения (легально различаются между приложениями): api/*, ui.ts,
ui-bits.tsx, host_net.py, authentik_admin_service.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = Path(__file__).resolve().parent / "profile-settings-manifest.json"

# Пути — относительно REPO_ROOT.
FRONTEND_MODULE = "frontend/src/modules/user-settings"

CORE_GLOBS = [
    "UserSettingsDialog.tsx",
    "components/ProfilePanel.tsx",
    "components/AppearancePanel.tsx",
    "components/SecurityPanel.tsx",
    "components/SessionsPanel.tsx",
    "components/AvatarPickerDialog.tsx",
    "components/AvatarArt.tsx",
    "types.ts",
    "context.tsx",
    "lib/*.ts",
    "i18n/ru.ts",
]

BACKEND_PROFILE_GLOBS = [
    "backend/app/services/authentik_client.py",
    "backend/app/services/unified_profile_service.py",
]

# Легальные расхождения между приложениями (префиксы путей; каталог — с "/").
EXCEPTIONS = [
    f"{FRONTEND_MODULE}/api/",
    f"{FRONTEND_MODULE}/ui.ts",
    f"{FRONTEND_MODULE}/components/ui-bits.tsx",
    "backend/app/core/host_net.py",
    "backend/app/services/authentik_admin_service.py",
]


def sha256_file(path: Path) -> str:
    """sha256 содержимого файла с нормализацией CRLF→LF.

    Ядро канона — исходники; хеш должен совпадать независимо от
    ``core.autocrlf`` на рабочей машине и в CI (Linux/LF).
    """
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk.replace(b"\r\n", b"\n"))
    return h.hexdigest()


def expand_core() -> dict[str, str]:
    """Относительный путь → sha256 для всех файлов ядра на диске."""
    files: dict[str, str] = {}
    base = REPO_ROOT / FRONTEND_MODULE
    for rel in CORE_GLOBS:
        for path in sorted(base.glob(rel)):
            rel_path = f"{FRONTEND_MODULE}/{path.relative_to(base).as_posix()}"
            files[rel_path] = sha256_file(path)
    for rel in BACKEND_PROFILE_GLOBS:
        for path in sorted(REPO_ROOT.glob(rel)):
            rel_path = path.relative_to(REPO_ROOT).as_posix()
            files[rel_path] = sha256_file(path)
    return files


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        sys.exit(f"Manifest not found: {MANIFEST_PATH}")
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def write_manifest(data: dict) -> None:
    with MANIFEST_PATH.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def bump_version(version: str) -> str:
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", version)
    if not m:
        raise SystemExit(f"Invalid semantic version: {version!r}")
    major, minor, patch = (int(x) for x in m.groups())
    return f"{major}.{minor}.{patch + 1}"


def check() -> list[str]:
    """Расхождения ядра/манифеста поимённо (пустой список — зелёный)."""
    manifest = load_manifest()
    expected: dict[str, str] = manifest.get("core", {})
    current = expand_core()

    issues: list[str] = []
    for rel in sorted(expected):
        if rel not in current:
            issues.append(f"MISSING  {rel}")
        elif current[rel] != expected[rel]:
            issues.append(f"CHANGED  {rel}")
    for rel in sorted(current):
        if rel not in expected:
            issues.append(f"NEW      {rel}")

    expected_exceptions = sorted(EXCEPTIONS)
    manifest_exceptions = sorted(manifest.get("exceptions", []))
    if manifest_exceptions != expected_exceptions:
        issues.append("EXCEPTIONS  список исключений манифеста отличается от скрипта")
    return issues


def cmd_verify(args: argparse.Namespace) -> int:
    issues = check()
    if issues:
        print("profile-settings manifest: найдены расхождения ядра:")
        for line in issues:
            print(f"  {line}")
    else:
        print("profile-settings manifest: OK — ядро совпадает с манифестом.")
    if args.strict and issues:
        return 1
    return 0


def cmd_sync(to_version: str | None = None) -> None:
    manifest = load_manifest()
    version = to_version or bump_version(manifest.get("version", "1.0.0"))
    if not re.match(r"^\d+\.\d+\.\d+$", version):
        raise SystemExit(f"Invalid semantic version: {version!r}")
    manifest["version"] = version
    manifest["core"] = expand_core()
    manifest["exceptions"] = sorted(EXCEPTIONS)
    write_manifest(manifest)
    print(f"synced -> version {manifest['version']}")


def cmd_version() -> None:
    manifest = load_manifest()
    print(manifest.get("version", "unknown"))


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(
        prog="verify-profile-settings",
        description="Верификация канона модуля настроек профиля",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("version", help="показать текущую версию в репо")
    p_verify = sub.add_parser("verify", help="сверить хеши ядра с манифестом")
    p_verify.add_argument(
        "--strict", action="store_true", help="exit 1 при любом расхождении (CI)"
    )
    p_sync = sub.add_parser("sync", help="перегенерировать хеши + поднять версию")
    p_sync.add_argument(
        "--to",
        metavar="VERSION",
        help="явная целевая версия (напр. 2.0.0 для мажора); без флага — patch+1",
    )

    args = parser.parse_args()
    if args.command == "verify":
        return cmd_verify(args)
    if args.command == "sync":
        cmd_sync(getattr(args, "to", None))
        return 0
    if args.command == "version":
        cmd_version()
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
