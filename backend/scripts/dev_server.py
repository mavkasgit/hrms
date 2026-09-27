"""Dev-сервер backend: hot reload, который не роняет остальной dev-стек.

Запуск (cwd = ``backend/``): ``python scripts/dev_server.py``
Используется скриптом ``npm run dev:backend`` → ``scripts/run-backend.ps1``.

Зачем отдельный скрипт
----------------------
1. **Рестарт не должен убивать соседей по консоли.** uvicorn на Windows
   перезапускает рабочий процесс через
   ``os.kill(pid, signal.CTRL_C_EVENT)``
   (``uvicorn/supervisors/basereload.py``). Это
   ``GenerateConsoleCtrlEvent``, а ``pid`` здесь не является id группы
   процессов, поэтому событие получает **вся консоль**: вместе с backend
   умирают FRONTEND и DB из ``npm run dev`` — с кодом 3221225786
   (0xC000013A STATUS_CONTROL_C_EXIT). Vite к этому отношения не имеет, он
   просто collateral. Здесь рабочий процесс убивается точечно:
   ``taskkill /F /T /PID``.
2. **Слушаем только ``backend/app``.** uvicorn всегда добавляет cwd в
   watch-files (``uvicorn/supervisors/watchfilesreload.py``), поэтому
   ``--reload-dir app`` сам по себе не спасал: правки ``backend/tests``,
   ``alembic`` и ``scripts`` тоже вызывали рестарт.
3. **Старый код доживает.** Если изменённый файл не компилируется
   (недописанный файл, опечатка) — рестарт пропускается, предыдущий процесс
   продолжает отдавать API.

Окружение (в т.ч. ``DATABASE_URL``) приходит из ``.env.dev``: на Windows его
инжектит ``scripts/run-backend.ps1``, на POSIX — ``scripts/run-backend.sh``.
Скрипт намеренно ничего не грузит сам — второй загрузчик env-файля был бы
вторым источником правды.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

import uvicorn
from uvicorn._subprocess import get_subprocess
from uvicorn.supervisors import ChangeReload
from uvicorn.supervisors.watchfilesreload import WatchFilesReload

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_DIR = (BACKEND_DIR / "app").resolve()
APP_IMPORT = "app.main:app"
HOST = "0.0.0.0"
DEFAULT_PORT = 8011

logger = logging.getLogger("uvicorn.error")


def _port() -> int:
    """Порт backend: ``BACKEND_PORT`` из окружения, иначе дефолт стенда."""
    raw = (os.getenv("BACKEND_PORT") or "").strip()
    if not raw:
        return DEFAULT_PORT
    try:
        return int(raw)
    except ValueError:
        logger.warning("BACKEND_PORT=%r не число, использую %s", raw, DEFAULT_PORT)
        return DEFAULT_PORT


def _syntax_problem(path: Path) -> str | None:
    """Вернуть описание ошибки компиляции или None, если файл в порядке."""
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:  # файл удалён/переименован — не мешает рестарту
        logger.debug("Не читается %s: %s", path, exc)
        return None
    try:
        compile(source, str(path), "exec")
    except SyntaxError as exc:
        return f"{exc.msg} (строка {exc.lineno})"
    except ValueError as exc:  # например, NUL-байт в исходнике
        return str(exc)
    return None


def _should_restart(self: WatchFilesReload) -> list[Path] | None:
    self.pause()

    changes = next(self.watcher)
    if not changes:
        return None

    paths = [Path(change[1]) for change in changes]
    paths = [
        path
        for path in paths
        if path.is_relative_to(APP_DIR) and self.watch_filter(path)
    ]
    if not paths:
        return None

    for path in paths:
        problem = _syntax_problem(path)
        if problem is not None:
            logger.error(
                "Рестарт пропущен: %s не компилируется (%s). Продолжаю работать "
                "на последней валидной версии кода.",
                path.relative_to(BACKEND_DIR),
                problem,
            )
            return None

    return paths


def _restart(self: WatchFilesReload) -> None:
    self.is_restarting = True
    pid = self.process.pid
    if pid is None:  # pragma: no cover — рабочий процесс ещё не стартовал
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            capture_output=True,
            check=False,
        )
    else:
        self.process.terminate()

    self.process.join()

    self.process = get_subprocess(
        config=self.config, target=self.target, sockets=self.sockets
    )
    self.process.start()
    # Сигнала от taskkill не придёт, поэтому сбрасываем флаг сами: иначе
    # следующий Ctrl+C пользователя будет проглочен (basereload.py).
    self.is_restarting = False


def main() -> int:
    os.chdir(BACKEND_DIR)
    # uvicorn CLI добавляет cwd в sys.path, мы запускаемся как скрипт — нет.
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    WatchFilesReload.should_restart = _should_restart  # type: ignore[method-assign]
    WatchFilesReload.restart = _restart  # type: ignore[method-assign]

    config = uvicorn.Config(
        APP_IMPORT,
        host=HOST,
        port=_port(),
        reload=True,
        reload_dirs=[str(APP_DIR)],
    )
    server = uvicorn.Server(config)
    # Решение про reloader принимает CLI (uvicorn/main.py), а не Server.run(),
    # поэтому повторяем его здесь — иначе скрипт стартует без hot reload.
    if config.should_reload:
        ChangeReload(config, target=server.run, sockets=[config.bind_socket()]).run()
    else:  # pragma: no cover — при reload=True всегда True
        server.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
