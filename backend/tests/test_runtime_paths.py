import socket

import app.runtime_paths as runtime_paths
from app.main import API_VERSION as main_api_version
from app.main import BACKEND_VERSION as main_backend_version
from app.version import API_VERSION, BACKEND_VERSION
from engine_main import port_is_available


def test_runtime_path_precedence(monkeypatch, tmp_path) -> None:
    explicit_db = tmp_path / "explicit.db"
    data_dir = tmp_path / "data-dir"
    monkeypatch.setenv("RESEARCH_OS_DB_PATH", str(explicit_db))
    monkeypatch.setenv("RESEARCH_OS_DATA_DIR", str(data_dir))
    assert runtime_paths.get_db_path() == explicit_db
    monkeypatch.delenv("RESEARCH_OS_DB_PATH")
    assert runtime_paths.get_db_path() == data_dir / "research-os.db"


def test_packaged_data_dir_uses_local_app_data_without_meipass(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("RESEARCH_OS_DB_PATH", raising=False)
    monkeypatch.delenv("RESEARCH_OS_DATA_DIR", raising=False)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    monkeypatch.setattr(runtime_paths.sys, "frozen", True, raising=False)
    monkeypatch.setattr(runtime_paths.sys, "_MEIPASS", str(tmp_path / "bundle"), raising=False)
    assert runtime_paths.get_db_path() == tmp_path / "LocalAppData" / "ResearchOS" / "data" / "research-os.db"


def test_developer_data_dir_remains_backend_local(monkeypatch) -> None:
    monkeypatch.delenv("RESEARCH_OS_DB_PATH", raising=False)
    monkeypatch.delenv("RESEARCH_OS_DATA_DIR", raising=False)
    monkeypatch.setattr(runtime_paths.sys, "frozen", False, raising=False)
    assert runtime_paths.get_db_path() == runtime_paths.developer_data_dir() / "research-os.db"


def test_port_preflight_detects_occupied_port() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as held:
        held.bind(("127.0.0.1", 0))
        port = held.getsockname()[1]
        assert port_is_available("127.0.0.1", port) is False


def test_version_is_a_single_source_of_truth() -> None:
    assert (main_backend_version, main_api_version) == (BACKEND_VERSION, API_VERSION)
