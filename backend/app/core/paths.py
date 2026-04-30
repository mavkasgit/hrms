from pathlib import Path, PurePosixPath, PureWindowsPath

from app.core.config import settings


STORAGE_MARKERS: dict[str, str] = {
    "ORDERS_PATH": "orders",
    "STAFFING_PATH": "staffing",
    "TEMPLATES_PATH": "templates",
    "PERSONAL_FILES_PATH": "personal",
    "BACKUPS_PATH": "backups",
}


def storage_root(base_key: str) -> Path:
    return Path(getattr(settings, base_key))


def storage_key(path: str | Path, base_key: str) -> str:
    """Return a portable POSIX storage key relative to settings.<base_key>."""
    raw = str(path).strip()
    if not raw:
        return raw

    base = storage_root(base_key)
    marker = STORAGE_MARKERS.get(base_key, base.name)

    relative = _relative_to_current_base(raw, base)
    if relative is not None:
        return _normalize_relative_key(relative)

    relative = _relative_after_marker(raw, marker)
    if relative is not None:
        return _normalize_relative_key(relative)

    if _is_absolute(raw):
        raise ValueError(f"Path is outside {base_key}: {raw}")

    return _normalize_relative_key(raw)


def storage_path(key: str | Path, base_key: str) -> Path:
    """Return an absolute filesystem path for a DB storage key.

    Legacy absolute paths are normalized first, so old backups still resolve to
    the current deployment's storage root.
    """
    raw = str(key).strip()
    if not raw:
        return Path(raw)
    return storage_root(base_key) / storage_key(raw, base_key)


def to_relative(path: str | Path, base_key: str) -> str:
    return storage_key(path, base_key)


def to_absolute(path: str | Path, base_key: str) -> Path:
    return storage_path(path, base_key)


def _is_absolute(path: str) -> bool:
    return PurePosixPath(path).is_absolute() or PureWindowsPath(path).is_absolute()


def _relative_to_current_base(path: str, base: Path) -> str | None:
    try:
        return Path(path).relative_to(base).as_posix()
    except ValueError:
        return None


def _relative_after_marker(path: str, marker: str) -> str | None:
    parts = _split_parts(path)
    if marker not in parts:
        return None

    marker_index = len(parts) - 1 - list(reversed(parts)).index(marker)
    relative_parts = parts[marker_index + 1 :]
    if not relative_parts:
        return ""
    return "/".join(relative_parts)


def _split_parts(path: str) -> list[str]:
    normalized = path.replace("\\", "/")
    return [part for part in normalized.split("/") if part]


def _normalize_relative_key(path: str | Path) -> str:
    normalized = str(path).strip().replace("\\", "/")
    if not normalized:
        return normalized
    if _is_absolute(normalized):
        raise ValueError(f"Storage key must be relative: {path}")

    parts = [part for part in normalized.split("/") if part and part != "."]
    if any(part == ".." for part in parts):
        raise ValueError(f"Storage key must not escape storage root: {path}")
    if not parts:
        return ""
    return PurePosixPath(*parts).as_posix()
