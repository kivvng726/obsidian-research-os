"""Run against a built Engine; deliberately excluded from ordinary pytest collection."""

import argparse
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import fitz


def request_json(url: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_health(base_url: str, process: subprocess.Popen[str]) -> float:
    started_at = time.monotonic()
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout else ""
            raise RuntimeError(f"Packaged Engine exited before health check: {output}")
        try:
            if request_json(f"{base_url}/health").get("status") == "ok":
                return time.monotonic() - started_at
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("Packaged Engine did not become healthy within 15 seconds")


def ensure_engine_port_is_free() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", 8765))
        except OSError as error:
            raise RuntimeError("Packaged smoke requires 127.0.0.1:8765 to be free; stop any existing Engine before building.") from error


def create_fixture_pdf(path: Path) -> None:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "ResearchOS packaged smoke fixture keyword: quartzpine")
    document.save(path)
    document.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", required=True, type=Path)
    arguments = parser.parse_args()
    engine = arguments.engine.resolve()
    if not engine.is_file():
        raise FileNotFoundError(f"Packaged Engine was not found: {engine}")
    temporary_root = Path(tempfile.mkdtemp(prefix="research-os-engine-smoke-"))
    process: subprocess.Popen[str] | None = None
    try:
        ensure_engine_port_is_free()
        vault = temporary_root / "vault"; attachments = vault / "09 Attachments"
        attachments.mkdir(parents=True)
        create_fixture_pdf(attachments / "fixture.pdf")
        data_dir = temporary_root / "engine-data"
        environment = os.environ.copy()
        environment.pop("RESEARCH_OS_DB_PATH", None)
        environment["RESEARCH_OS_DATA_DIR"] = str(data_dir)
        process = subprocess.Popen([str(engine)], cwd=str(engine.parent), env=environment,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        base_url = "http://127.0.0.1:8765"
        startup_seconds = wait_for_health(base_url, process)
        version = request_json(f"{base_url}/version")
        assert isinstance(version.get("backendVersion"), str) and version.get("apiVersion") == 1
        indexed = request_json(f"{base_url}/documents/index", "POST", {
            "vaultRoot": str(vault), "paperId": "smoke-paper", "sourcePath": "09 Attachments/fixture.pdf"
        })
        assert indexed["pageCount"] > 0 and indexed["chunkCount"] > 0
        result = request_json(f"{base_url}/search", "POST", {"query": "quartzpine", "mode": "keyword", "topK": 5})
        assert result["results"] and "quartzpine" in result["results"][0]["text"]
        database = data_dir / "research-os.db"
        if not database.is_file():
            found_databases = list(temporary_root.rglob("*.db"))
            raise AssertionError(f"Packaged Engine did not use the requested temporary data directory: {data_dir}; found {found_databases}")
        with sqlite3.connect(database) as connection:
            assert connection.execute("SELECT count(*) FROM documents").fetchone()[0] == 1
            assert connection.execute("SELECT count(*) FROM chunks").fetchone()[0] > 0
            assert connection.execute("SELECT count(*) FROM chunk_fts").fetchone()[0] > 0
        print(
            "Packaged Engine smoke passed: health, version, PDF indexing, SQLite FTS5 keyword retrieval. "
            f"Health-ready in {startup_seconds:.2f}s."
        )
        return 0
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=8)
        shutil.rmtree(temporary_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
