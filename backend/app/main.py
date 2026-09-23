from fastapi import FastAPI

BACKEND_VERSION = "0.1.0"
API_VERSION = 1

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "research-os-backend"}


@app.get("/version")
def version() -> dict[str, str | int]:
    return {"backendVersion": BACKEND_VERSION, "apiVersion": API_VERSION}
