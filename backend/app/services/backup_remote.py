"""Дополнительная копия резервных копий во внешнее хранилище.

Копирование выполняет `rclone <https://rclone.org>`_: он умеет SMB/CIFS,
SFTP, FTP(S), WebDAV, NFS, локальные и съёмные диски. Благодаря этому модулю
backend не зависит ни от ОС, ни от способа запуска: внутри контейнера не нужны
ни монтирования, ни буквы сетевых дисков, ни планировщик ОС — достаточно
исходящего сетевого доступа.

Режимы доступа (``auth_mode``):
    * ``guest`` — без учётной записи (анонимный/гостевой доступ);
    * ``credentials`` — логин, пароль и, при необходимости, домен.

Гостевой режим невозможен для SFTP: там всегда нужна учётная запись (можно
задать её прямо в адресе, ``sftp://user:pass@host/path``). NFS и готовое имя
remote из ``rclone.conf`` учётные данные не принимают — они задаются на самом
хранилище или в ``rclone.conf``.

Пароль в ``config.json`` хранится зашифрованным (Fernet, ключ выводится из
``SECRET_KEY``). Открытым текстом он существует только в момент вызова rclone
и никогда не возвращается наружу: ни в UI, ни в статусе, ни в логах.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import unquote, urlparse, urlunparse

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings
from app.core.logging import logger
from app.services.backup_retention import normalize_limits, plan_rotation_with_limits

STATUS_FILENAME = "remote-status.json"
AUTH_MODES = ("guest", "credentials")

# Сколько последних строк stderr держим для сообщения об ошибке.
_ERROR_TAIL_LINES = 20
_PROGRESS_RE = re.compile(r"(\d{1,3})%")
# Секреты в строках подключения rclone: pass='...', password=... .
_SECRET_RE = re.compile(r"(pass(?:word)?)=('(?:[^']|'')*'|\S+)", re.IGNORECASE)
# Локальные пути: POSIX-абсолютные и диски Windows.
_LOCAL_ABSOLUTE_RE = re.compile(r"^(/|[A-Za-z]:[\\/])")
# Готовое имя remote из rclone.conf: "nas:backup" (но не "smb://...").
_REMOTE_SPEC_RE = re.compile(r"^[^\s\\/]+:(?!//)")
# Ротация трогает только наши архивы, а не любые .zip в общей папке.
_REMOTE_BACKUP_RE = re.compile(r"^backup_.+\.zip$")
_RCLONE_MISSING = (
    "rclone не установлен. Установите rclone в образ/систему или задайте RCLONE_PATH."
)

_OPERATION_LOCK = threading.Lock()

# Текстовые поля конфига: перечислены один раз, чтобы новое поле не требовало
# правок в четырёх местах (normalize/update/public/UI-контракт).
_TEXT_FIELDS = ("destination", "username", "domain", "bwlimit")
_PUBLIC_FIELDS = ("enabled", "auth_mode", *_TEXT_FIELDS, "retention")


class RemoteBackupError(Exception):
    """Ошибка обмена с внешним хранилищем."""

    error_kind = "storage"


class RemoteConfigError(RemoteBackupError):
    """Ошибка настроек внешней копии (адрес, режим доступа, пароль)."""

    error_kind = "config"


@dataclass(frozen=True)
class Destination:
    """Разобранный адрес внешнего хранилища."""

    backend: str
    display: str
    host: str = ""
    port: int | None = None
    share_path: str = ""
    url: str = ""
    local_path: str = ""
    raw_spec: str = ""
    url_user: str = ""
    url_password: str = ""


@dataclass
class RuntimeConfig:
    """Конфигурация внешней копии с расшифрованным паролем."""

    enabled: bool
    auth_mode: str
    username: str
    password: str
    domain: str
    bwlimit: str
    retention: dict[str, int]
    target: Destination


# ---------------------------------------------------------------------------
# Настройки
# ---------------------------------------------------------------------------


def default_config() -> dict:
    return {
        "enabled": False,
        "destination": "",
        "auth_mode": "guest",
        "username": "",
        "domain": "",
        "bwlimit": "",
        "password_enc": "",
        "retention": normalize_limits(None),
    }


def normalize_config(raw: dict | None) -> dict:
    """Дополняет пользовательский конфиг значениями по умолчанию."""
    result = default_config()
    if not isinstance(raw, dict):
        return result

    result["enabled"] = bool(raw.get("enabled", False))
    for field in _TEXT_FIELDS:
        result[field] = str(raw.get(field) or "").strip()
    auth_mode = str(raw.get("auth_mode") or "guest").strip().lower()
    result["auth_mode"] = auth_mode if auth_mode in AUTH_MODES else "guest"
    result["password_enc"] = str(raw.get("password_enc") or "")
    result["retention"] = normalize_limits(raw.get("retention"))
    return result


def is_enabled(raw: dict | None) -> bool:
    """Автоматическая копия: включена и адрес задан."""
    cfg = normalize_config(raw)
    return bool(cfg["enabled"] and cfg["destination"])


def is_configured(raw: dict | None) -> bool:
    """Адрес задан — можно копировать вручную, даже если автокопия выключена."""
    return bool(normalize_config(raw)["destination"])


def public_config(raw: dict | None) -> dict:
    """Конфиг для отдачи в UI: без пароля, но с признаком его наличия."""
    cfg = normalize_config(raw)
    public = {field: cfg[field] for field in _PUBLIC_FIELDS}
    public["has_password"] = bool(cfg["password_enc"])
    return public


def apply_update(current: dict | None, update: dict) -> dict:
    """Применяет изменения из UI к сохранённому конфигу.

    ``password``: отсутствует — оставить как есть, пустая строка — очистить,
    иначе — зашифровать новое значение.
    """
    cfg = normalize_config(current)

    if "enabled" in update:
        cfg["enabled"] = bool(update["enabled"])
    for field in _TEXT_FIELDS:
        if field in update:
            cfg[field] = str(update.get(field) or "").strip()
    if "auth_mode" in update:
        auth_mode = str(update.get("auth_mode") or "guest").strip().lower()
        if auth_mode not in AUTH_MODES:
            raise RemoteConfigError("Неизвестный режим доступа к внешнему диску")
        cfg["auth_mode"] = auth_mode
    if "retention" in update:
        cfg["retention"] = normalize_limits(update.get("retention"))

    password = update.get("password")
    if password is not None:
        if password == "":
            cfg["password_enc"] = ""
        else:
            cfg["password_enc"] = encrypt_secret(str(password))

    validate_bwlimit(cfg["bwlimit"])
    if cfg["destination"] or cfg["enabled"]:
        validate_destination(cfg)
    return cfg


def validate_bwlimit(value: str) -> None:
    if not value:
        return
    if not re.fullmatch(r"\d+(?:\.\d+)?[BKMGTP]?", value, flags=re.IGNORECASE):
        raise RemoteConfigError("Лимит скорости указывается как число с суффиксом, например 10M")


def validate_destination(cfg: dict) -> Destination:
    """Проверяет адрес и совместимость с выбранным режимом доступа.

    Ошибки здесь — ошибки настроек (422), а не сбои хранилища (502).
    """
    if not cfg["destination"]:
        raise RemoteConfigError("Укажите путь для дополнительной копии")

    dest = parse_destination(cfg["destination"])
    url_has_credentials = bool(dest.url_user and dest.url_password)

    if cfg["auth_mode"] == "credentials":
        if dest.backend == "nfs":
            raise RemoteConfigError(
                "NFS не использует логин и пароль: выберите гостевой доступ, "
                "а права задайте на сервере NFS."
            )
        if dest.backend == "raw":
            raise RemoteConfigError(
                "Для готового remote rclone учётные данные задаются в rclone.conf: "
                "выберите гостевой доступ или укажите адрес с логином в URL."
            )
        if not cfg["username"] and not url_has_credentials:
            raise RemoteConfigError("Для режима с учётной записью нужен логин")

    if cfg["auth_mode"] == "guest" and dest.backend == "sftp" and not url_has_credentials:
        raise RemoteConfigError(
            "SFTP не поддерживает гостевой доступ: выберите режим с учётной записью "
            "или укажите логин и пароль в адресе (sftp://user:pass@host/path)."
        )

    return dest


def build_runtime(raw: dict | None) -> RuntimeConfig:
    cfg = normalize_config(raw)
    destination = validate_destination(cfg)
    return RuntimeConfig(
        enabled=cfg["enabled"],
        auth_mode=cfg["auth_mode"],
        username=cfg["username"],
        password=decrypt_secret(cfg["password_enc"]),
        domain=cfg["domain"],
        bwlimit=cfg["bwlimit"],
        retention=cfg["retention"],
        target=destination,
    )


# ---------------------------------------------------------------------------
# Шифрование пароля
# ---------------------------------------------------------------------------


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise RemoteConfigError(
            "Не удалось расшифровать пароль внешнего диска (изменился SECRET_KEY). "
            "Введите пароль заново."
        ) from exc


# ---------------------------------------------------------------------------
# Разбор адреса
# ---------------------------------------------------------------------------


def parse_destination(value: str) -> Destination:
    """Понимает UNC, smb://, sftp://, ftp(s)://, webdav(s)://, http(s)://, nfs://
    и локальные пути."""
    text = (value or "").strip().strip('"').strip("'")
    if not text:
        raise RemoteConfigError("Укажите путь для дополнительной копии")

    if text.startswith("\\\\") or text.startswith("//"):
        rest = text.lstrip("\\/")
        parts = re.split(r"[\\/]+", rest, maxsplit=1)
        if len(parts) < 2 or not parts[0] or not parts[1]:
            raise RemoteConfigError(
                "Некорректный путь к сетевому диску: ожидается \\\\сервер\\шара\\папка"
            )
        share_path = parts[1].replace("\\", "/").strip("/")
        return Destination(backend="smb", host=parts[0], share_path=share_path, display=text)

    if _LOCAL_ABSOLUTE_RE.match(text) and "://" not in text:
        return Destination(backend="local", local_path=text, display=text)

    parsed = urlparse(text)
    scheme = (parsed.scheme or "").lower()
    display = _display_url(text, parsed)

    if scheme in ("smb", "cifs"):
        if not parsed.hostname:
            raise RemoteConfigError("В адресе SMB не указан сервер")
        return Destination(
            backend="smb",
            host=parsed.hostname,
            port=_parse_port(parsed),
            share_path=parsed.path.lstrip("/"),
            display=display,
            url_user=unquote(parsed.username or ""),
            url_password=unquote(parsed.password or ""),
        )

    if scheme in ("sftp", "ftp", "ftps"):
        if not parsed.hostname:
            raise RemoteConfigError(f"В адресе {scheme} не указан сервер")
        return Destination(
            backend="ftps" if scheme == "ftps" else scheme,
            host=parsed.hostname,
            port=_parse_port(parsed),
            share_path=parsed.path or "/",
            display=display,
            url_user=unquote(parsed.username or ""),
            url_password=unquote(parsed.password or ""),
        )

    if scheme in ("webdav", "webdavs", "http", "https"):
        url_scheme = "https" if scheme in ("webdavs", "https") else "http"
        url = f"{url_scheme}://{parsed.netloc}{parsed.path}"
        return Destination(
            backend="webdav",
            url=url.rstrip("/"),
            display=display,
            url_user=unquote(parsed.username or ""),
            url_password=unquote(parsed.password or ""),
        )

    if scheme == "nfs":
        if not parsed.hostname:
            raise RemoteConfigError("В адресе NFS не указан сервер")
        return Destination(
            backend="nfs",
            host=parsed.hostname,
            share_path=parsed.path or "/",
            display=display,
        )

    if scheme == "file":
        return Destination(backend="local", local_path=unquote(parsed.path), display=text)

    if _REMOTE_SPEC_RE.match(text):
        # Продвинутый вариант: готовое имя remote из rclone.conf, например "nas:backup".
        return Destination(backend="raw", raw_spec=text, display=scrub_secrets(text))

    if _LOCAL_ABSOLUTE_RE.match(text):
        return Destination(backend="local", local_path=text, display=text)

    raise RemoteConfigError(
        "Не удалось распознать путь. Поддерживаются: \\\\сервер\\шара\\папка, "
        "smb://сервер/шара/папка, sftp://, ftp://, webdav://, nfs:// и локальные пути."
    )


def _display_url(text: str, parsed) -> str:
    """Адрес без логина и пароля: они не должны попадать в UI и статусы."""
    if not parsed.username and not parsed.password:
        return text
    netloc = parsed.netloc
    if "@" in netloc:
        netloc = netloc.rsplit("@", 1)[1]
    return urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))


def _parse_port(parsed) -> int | None:
    try:
        return parsed.port
    except ValueError as exc:
        raise RemoteConfigError("Некорректный порт в адресе внешнего хранилища") from exc


def _quote(value: str) -> str:
    """Экранирование значения в строке подключения rclone."""
    return "'" + value.replace("'", "''") + "'"


def _join_params(pairs: list[tuple[str, str]]) -> str:
    return "".join(f",{key}={_quote(str(value))}" for key, value in pairs if value)


def build_target(cfg: RuntimeConfig) -> str:
    """Собирает адрес rclone для каталога назначения."""
    dest = cfg.target
    use_credentials = cfg.auth_mode == "credentials"
    # Данные из URL (user:pass@host) уважаем и в гостевом режиме.
    user = (cfg.username if use_credentials else "") or dest.url_user
    password = (cfg.password if use_credentials else "") or dest.url_password

    if dest.backend == "local":
        return dest.local_path

    if dest.backend == "raw":
        return dest.raw_spec

    if dest.backend == "smb":
        pairs: list[tuple[str, str]] = [("host", dest.host)]
        if dest.port:
            pairs.append(("port", str(dest.port)))
        if user or password:
            pairs.append(("user", user or "guest"))
            if password:
                pairs.append(("pass", password))
        else:
            # rclone не умеет анонимный SMB: для гостевого доступа нужен user=guest.
            pairs.append(("user", "guest"))
        if cfg.domain:
            pairs.append(("domain", cfg.domain))
        spec = f":smb{_join_params(pairs)}:{dest.share_path}"
        return spec.rstrip("/")

    if dest.backend in ("sftp", "ftp", "ftps"):
        if dest.backend == "sftp":
            user = user or "root"
            if not password:
                raise RemoteConfigError(
                    "SFTP не поддерживает гостевой доступ. Выберите режим с учётной записью."
                )
        else:
            user = user or "anonymous"
        pairs = [("host", dest.host)]
        if dest.port:
            pairs.append(("port", str(dest.port)))
        pairs.append(("user", user))
        if password:
            pairs.append(("pass", password))
        spec = f":{dest.backend}{_join_params(pairs)}:{dest.share_path}"
        return spec.rstrip("/")

    if dest.backend == "webdav":
        pairs = [("url", dest.url), ("vendor", "other")]
        if use_credentials or user:
            pairs.append(("user", user))
        if password:
            pairs.append(("pass", password))
        return f":webdav{_join_params(pairs)}:"

    if dest.backend == "nfs":
        pairs = [("host", dest.host)]
        return f":nfs{_join_params(pairs)}:{dest.share_path}"

    raise RemoteConfigError(f"Неподдерживаемый тип хранилища: {dest.backend}")


# ---------------------------------------------------------------------------
# Запуск rclone
# ---------------------------------------------------------------------------


def _binary() -> str:
    return settings.RCLONE_PATH or "rclone"


def _run(args: list[str], timeout: int | None = None) -> subprocess.CompletedProcess:
    limit = timeout or settings.BACKUP_REMOTE_TIMEOUT
    command = [_binary(), *args]
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=limit,
        )
    except FileNotFoundError as exc:
        raise RemoteBackupError(_RCLONE_MISSING) from exc
    except subprocess.TimeoutExpired as exc:
        raise RemoteBackupError(
            f"Обмен с внешним диском прерван по таймауту ({limit} с)"
        ) from exc


def scrub_secrets(text: str) -> str:
    """Убирает пароли из строк подключения, чтобы они не попали в UI и логи."""
    return _SECRET_RE.sub(r"\1=***", text or "")


def _friendly_error(stderr: str) -> str:
    text = scrub_secrets(stderr).strip()
    low = text.lower()
    if "logon failure" in low or "access is denied" in low or "permission denied" in low:
        return "Нет доступа к внешнему диску: проверьте учётную запись и права на папку."
    if (
        "no such host" in low
        or "name or service not known" in low
        or "connection refused" in low
        or "connection timed out" in low
        or "i/o timeout" in low
        or "no route to host" in low
    ):
        return "Внешний диск недоступен: проверьте адрес, сеть и порт."
    if "directory not found" in low or "path not found" in low:
        return "Папка на внешнем диске не найдена."
    if "not found" in low and "rclone" in low:
        return _RCLONE_MISSING
    last_line = text.splitlines()[-1] if text else ""
    return last_line or "Неизвестная ошибка rclone"


def _ensure_success(result: subprocess.CompletedProcess, action: str) -> subprocess.CompletedProcess:
    if result.returncode != 0:
        raise RemoteBackupError(f"{action}: {_friendly_error(result.stderr)}")
    return result


def _run_with_progress(
    args: list[str],
    progress: Callable[[int, str], None] | None,
) -> None:
    """Запускает rclone и транслирует процент выполнения наружу."""
    limit = settings.BACKUP_REMOTE_TIMEOUT
    started = time.monotonic()
    tail: list[str] = []
    try:
        process = subprocess.Popen(
            [_binary(), *args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError as exc:
        raise RemoteBackupError(_RCLONE_MISSING) from exc

    timed_out = False

    def kill_on_timeout() -> None:
        nonlocal timed_out
        timed_out = True
        if process.poll() is None:
            process.kill()

    # Watchdog: rclone может молчать, поэтому одного счётчика в цикле чтения мало.
    watchdog = threading.Timer(limit, kill_on_timeout)
    watchdog.daemon = True
    watchdog.start()
    try:
        assert process.stderr is not None
        for line in process.stderr:
            if line.strip():
                tail.append(line.rstrip())
                if len(tail) > _ERROR_TAIL_LINES:
                    tail.pop(0)
            match = _PROGRESS_RE.search(line)
            if match and progress:
                percent = min(100, max(0, int(match.group(1))))
                progress(percent, "Копирование на внешний диск")
            if time.monotonic() - started > limit:
                kill_on_timeout()
                break
        returncode = process.wait()
    finally:
        watchdog.cancel()
        if process.poll() is None:
            process.kill()

    if timed_out:
        raise RemoteBackupError(f"Копирование прервано по таймауту ({limit} с)")
    if returncode != 0:
        raise RemoteBackupError(f"Копирование не удалось: {_friendly_error(chr(10).join(tail))}")


# ---------------------------------------------------------------------------
# Операции
# ---------------------------------------------------------------------------


def test_destination(raw: dict | None) -> dict:
    """Проверяет чтение, запись и удаление по указанному адресу."""
    cfg = build_runtime(raw)
    target = build_target(cfg)

    # Проба пишет и удаляет файл: не пересекаемся с копированием/ротацией.
    with _OPERATION_LOCK:
        listing = _ensure_success(_run(["lsf", target, "--files-only"]), "Проверка чтения")

        with tempfile.TemporaryDirectory(prefix="hrms-remote-probe-") as tmp_dir:
            probe = Path(tmp_dir) / ".__hrms_probe"
            probe.write_bytes(b"hrms remote probe")
            remote_probe = f"{target}/.__hrms_probe"
            _ensure_success(
                _run(["copyto", str(probe), remote_probe, "--contimeout", "30s", "--timeout", "120s"]),
                "Проверка записи",
            )
            _ensure_success(
                _run(["deletefile", remote_probe], timeout=120),
                "Проверка удаления пробного файла",
            )

    files = [line for line in (listing.stdout or "").splitlines() if line.strip()]
    return {
        "ok": True,
        "backend": cfg.target.backend,
        "destination": cfg.target.display,
        "files": len(files),
        "message": "Внешний диск доступен для чтения, записи и удаления",
    }


def upload_backup(
    local_path: Path,
    raw: dict | None,
    progress: Callable[[int, str], None] | None = None,
) -> dict:
    """Копирует архив и его метаданные, затем применяет GFS-ротацию.

    Копирование доступно всегда, когда задан адрес: ручная копия нужна и при
    выключенной автокопии (например, чтобы залить существующие архивы).
    """
    cfg = build_runtime(raw)
    if not local_path.exists():
        raise RemoteBackupError(f"Файл бэкапа не найден: {local_path.name}")

    target = build_target(cfg)
    remote_file = f"{target}/{local_path.name}"
    # Наружу отдаём только безопасный адрес без учётных данных.
    display_file = f"{cfg.target.display.rstrip('/')}/{local_path.name}"
    total = local_path.stat().st_size

    args = [
        "copyto",
        str(local_path),
        remote_file,
        "--retries", "3",
        "--retries-sleep", "5s",
        "--low-level-retries", "10",
        "--contimeout", "30s",
        "--timeout", "300s",
        "--stats", "1s",
        "--stats-one-line",
    ]
    if cfg.bwlimit:
        args.extend(["--bwlimit", cfg.bwlimit])

    rotation_error = ""
    deleted: list[str] = []
    with _OPERATION_LOCK:
        _run_with_progress(args, progress)
        _verify_size(remote_file, total)

        sidecar = local_path.with_name(f"{local_path.name}.json")
        if sidecar.exists():
            _ensure_success(
                _run([
                    "copyto",
                    str(sidecar),
                    f"{remote_file}.json",
                    "--contimeout", "30s",
                    "--timeout", "120s",
                ]),
                "Копирование метаданных",
            )

        # Копия уже создана и проверена: сбой ротации не должен помечать её
        # неудачной. Локальная и внешняя ротация независимы.
        try:
            deleted = rotate(cfg)
        except Exception as exc:  # noqa: BLE001 — ротация не должна ломать копию
            rotation_error = scrub_secrets(str(exc)) or exc.__class__.__name__
            logger.warning("Ротация на внешнем диске не удалась", error=rotation_error)

    return {
        "remote_path": display_file,
        "size": total,
        "deleted": deleted,
        "rotation_error": rotation_error,
    }


def upload_with_status(
    local_path: Path,
    raw: dict | None,
    progress: Callable[[int, str], None] | None = None,
) -> dict | None:
    """Копирует архив и всегда фиксирует статус, не пробрасывая сбои.

    Возвращает ``None``, если адрес не настроен: автоматической копии нечего
    делать. Ошибки настроек помечаются ``error_kind="config"``, сбои
    хранилища — ``"storage"``, прочие — ``"unexpected"``.
    """
    if not is_configured(raw):
        return None

    started_at = datetime.now().isoformat()
    if progress:
        progress(0, "Подготовка к копированию")
    try:
        result = upload_backup(local_path, raw, progress)
    except Exception as exc:  # noqa: BLE001 — внешняя копия не должна ломать бэкап
        message = str(exc) if isinstance(exc, RemoteBackupError) else f"Непредвиденная ошибка: {exc}"
        message = scrub_secrets(message)
        status = {
            "ok": False,
            "filename": local_path.name,
            "started_at": started_at,
            "finished_at": datetime.now().isoformat(),
            "error": message,
            "error_kind": getattr(exc, "error_kind", "unexpected"),
        }
        write_status(status)
        logger.warning(
            "Копирование бэкапа на внешний диск не удалось",
            filename=local_path.name,
            error=message,
            error_kind=status["error_kind"],
        )
        return status

    status = {
        "ok": True,
        "filename": local_path.name,
        "started_at": started_at,
        "finished_at": datetime.now().isoformat(),
        "size": result.get("size"),
        "remote_path": result.get("remote_path"),
        "deleted": result.get("deleted", []),
        "rotation_error": result.get("rotation_error") or "",
    }
    write_status(status)
    logger.info(
        "Бэкап скопирован на внешний диск",
        filename=local_path.name,
        remote_path=status["remote_path"],
    )
    return status


def _verify_size(remote_file: str, expected: int) -> None:
    result = _run(["lsjson", remote_file, "--stat", "--no-mimetype"])
    if result.returncode != 0:
        raise RemoteBackupError(
            f"Не удалось проверить копию на внешнем диске: {_friendly_error(result.stderr)}"
        )
    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise RemoteBackupError("Внешний диск вернул некорректный ответ при проверке копии") from exc
    actual = int(payload.get("Size") or 0)
    if actual != expected:
        raise RemoteBackupError(
            f"Размер копии не совпадает: ожидалось {expected} байт, получено {actual}"
        )


def rotate(cfg: RuntimeConfig) -> list[str]:
    """Удаляет на внешнем диске лишние копии по тем же правилам, что и локально."""
    target = build_target(cfg)
    result = _run(["lsjson", target, "--files-only", "--no-mimetype"])
    if result.returncode != 0:
        raise RemoteBackupError(f"Не удалось получить список копий: {_friendly_error(result.stderr)}")

    try:
        items = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []

    entries: list[tuple[datetime, str, str]] = []
    for item in items:
        name = str(item.get("Name") or "")
        # В общей папке могут лежать чужие zip: удаляем только свои бэкапы.
        if not _REMOTE_BACKUP_RE.match(name):
            continue
        meta = _read_remote_meta(target, name)
        backup_type = str((meta or {}).get("backup_type") or "manual")
        entries.append((_parse_mtime(item.get("ModTime")), name, backup_type))

    entries.sort(key=lambda entry: entry[0], reverse=True)
    to_delete = plan_rotation_with_limits(
        [(name, backup_type) for _, name, backup_type in entries],
        cfg.retention,
    )

    deleted: list[str] = []
    for name in to_delete:
        removal = _run(["deletefile", f"{target}/{name}"])
        if removal.returncode != 0:
            logger.warning(
                "Не удалось удалить копию на внешнем диске",
                filename=name,
                error=_friendly_error(removal.stderr),
            )
            continue
        _run(["deletefile", f"{target}/{name}.json"], timeout=60)
        deleted.append(name)
    return deleted


_MIN_TIME = datetime.min.replace(tzinfo=timezone.utc)


def _parse_mtime(value: object) -> datetime:
    """Время изменения файла; всегда timezone-aware, чтобы сортировка не падала."""
    if not isinstance(value, str) or not value:
        return _MIN_TIME
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return _MIN_TIME
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _read_remote_meta(target: str, filename: str) -> dict | None:
    result = _run(["cat", f"{target}/{filename}.json"], timeout=60)
    if result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


# ---------------------------------------------------------------------------
# Статус последней копии (для UI)
# ---------------------------------------------------------------------------


def _status_path() -> Path:
    return Path(settings.BACKUPS_PATH) / STATUS_FILENAME


def read_status() -> dict | None:
    path = _status_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def write_status(payload: dict) -> None:
    path = _status_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        logger.warning("Не удалось сохранить статус копии на внешний диск")
