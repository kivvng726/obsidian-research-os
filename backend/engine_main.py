"""Console launcher for the packaged, localhost-only Research OS Engine."""

import socket
import sys

import uvicorn

from app.main import app
from app.runtime_paths import ensure_data_dir, is_frozen
from app.version import API_VERSION, BACKEND_VERSION

HOST = "127.0.0.1"
PORT = 8765


def port_is_available(host: str = HOST, port: int = PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((host, port))
        except OSError:
            return False
    return True


def pause_after_packaged_failure() -> None:
    if is_frozen() and getattr(sys, "stdin", None) and sys.stdin.isatty():
        try:
            input("Press Enter to close.")
        except EOFError:
            pass


def main() -> int:
    print("Research OS Engine")
    print(f"Version: {BACKEND_VERSION} (API {API_VERSION})")
    if not port_is_available():
        print("Research OS Engine could not start.")
        print("Port 8765 is already in use.")
        print("Another Research OS Engine may already be running.")
        pause_after_packaged_failure()
        return 1
    data_dir = ensure_data_dir()
    print(f"Listening on http://{HOST}:{PORT}")
    print("Keep this window open while using Research AI.")
    print(f"Derived data directory: {data_dir}")
    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="warning", access_log=False,
                    loop="asyncio", http="h11", ws="none")
    except OSError:
        print("Research OS Engine could not start.")
        print("Port 8765 is already in use.")
        print("Another Research OS Engine may already be running.")
        pause_after_packaged_failure()
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
