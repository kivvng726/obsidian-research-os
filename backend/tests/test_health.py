from fastapi.testclient import TestClient

from app.main import API_VERSION, BACKEND_VERSION, app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_version() -> None:
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json() == {"backendVersion": BACKEND_VERSION, "apiVersion": API_VERSION}


def test_unknown_endpoint_returns_not_found() -> None:
    assert client.get("/unknown").status_code == 404
