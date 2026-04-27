"""
캐치업코리아 cafe24 판매 집계 — Backend 진입점.

실행:
    py backend/main.py
브라우저:
    http://127.0.0.1:8000

라우팅 정책:
    - frontend/dist 가 빌드되어 있으면 / 에 신규 React UI 서빙.
    - 없으면 / 에 레거시 web/static/index.html 서빙 (예전 운영 UI).
    - 레거시 UI는 frontend 빌드 여부와 무관하게 /legacy 에서도 접근 가능.
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
FRONTEND_DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="catchup")
app.include_router(catalog_router)
app.include_router(sales_router)

# 레거시 UI는 항상 /legacy 로 접근 가능
app.mount("/legacy", StaticFiles(directory=WEB_STATIC, html=True), name="legacy")

# 신규 frontend dist 가 있으면 / 에 서빙, 없으면 레거시로 fallback
_USE_FRONTEND = FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists()
if _USE_FRONTEND:
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )

    @app.get("/")
    def index():
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def index():
        return FileResponse(WEB_STATIC / "index.html")


if __name__ == "__main__":
    import os
    import uvicorn
    host = os.environ.get("CATCHUP_HOST", "127.0.0.1")
    port = int(os.environ.get("CATCHUP_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
