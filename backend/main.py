"""
캐치업코리아 cafe24 판매 집계 — Backend 진입점.

실행:
    py backend/main.py
브라우저:
    http://127.0.0.1:8000
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.domains.catalog.routes import router as catalog_router
from backend.domains.sales.routes import router as sales_router

WEB_STATIC = ROOT / "web" / "static"

app = FastAPI(title="catchup")
app.include_router(catalog_router)
app.include_router(sales_router)
app.mount("/static", StaticFiles(directory=WEB_STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(WEB_STATIC / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
