"""Runtime-only paths for derived Engine data; never use PyInstaller resources."""

import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def developer_data_dir() -> Path:
    return Path(__file__).resolve().parent.parent / ".data"


def packaged_data_dir() -> Path:
    local_app_data = os.getenv("LOCALAPPDATA")
    base = Path(local_app_data) if local_app_data else Path.home() / "AppData" / "Local"
    return base / "ResearchOS" / "data"


def get_data_dir() -> Path:
    override = os.getenv("RESEARCH_OS_DATA_DIR", "").strip()
    if override:
        return Path(override)
    return packaged_data_dir() if is_frozen() else developer_data_dir()


def get_db_path() -> Path:
    override = os.getenv("RESEARCH_OS_DB_PATH", "").strip()
    if override:
        return Path(override)
    return get_data_dir() / "research-os.db"


def ensure_data_dir() -> Path:
    directory = get_data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    return directory
