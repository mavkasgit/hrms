"""In-memory sliding-window rate limiter (per-key)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Thread-safe sliding window limiter.

    Allows at most ``max_requests`` events per ``window_seconds`` for each key.
    """

    def __init__(self, max_requests: int = 30, window_seconds: float = 60.0) -> None:
        if max_requests < 1:
            raise ValueError("max_requests must be >= 1")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be > 0")
        self.max_requests = max_requests
        self.window_seconds = float(window_seconds)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, *, now: float | None = None) -> bool:
        """Record a hit for ``key``. Return True if under limit, False if exceeded."""
        ts = time.monotonic() if now is None else now
        window_start = ts - self.window_seconds
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= window_start:
                q.popleft()
            if len(q) >= self.max_requests:
                return False
            q.append(ts)
            return True

    def reset(self) -> None:
        """Clear all recorded hits (tests)."""
        with self._lock:
            self._hits.clear()
