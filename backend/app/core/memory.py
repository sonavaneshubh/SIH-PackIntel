"""Lightweight worker RSS sampling for diagnosing memory spikes.

Reading memory is a diagnostics concern, not a production logger: callers opt in
via ``ENABLE_MEMORY_MONITOR`` and emit at most one line per pipeline stage. On
Linux (Render) RSS comes from ``/proc/self/status``; on other platforms the
helpers are safe no-ops so the same code works locally.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _rss_kib() -> Optional[int]:
    """Return the current process RSS in KiB, or None when unavailable."""
    try:
        if os.path.exists("/proc/self/status"):
            with open("/proc/self/status", "r", encoding="utf-8") as status_file:
                for line in status_file:
                    if line.startswith("VmRSS:"):
                        parts = line.split()
                        if len(parts) >= 2:
                            return int(parts[1])
    except (OSError, ValueError, TypeError):
        pass
    return None


def current_rss_mb() -> Optional[float]:
    """Current worker RSS in MiB (None when unsupported)."""
    kib = _rss_kib()
    return round(kib / 1024.0, 1) if kib is not None else None


def log_memory(stage: str) -> None:
    """Log ``stage=rss MB`` once when ENABLE_MEMORY_MONITOR is set.

    Emits nothing when the flag or the RSS source is unavailable, so existing
    deployments keep their current log volume.
    """
    if not settings.ENABLE_MEMORY_MONITOR:
        return
    rss = current_rss_mb()
    if rss is None:
        return
    logger.info("MEMORY: stage=%s rss=%.1fMB", stage, rss)