"""카테고리/버전 조회 라우트."""
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.core.version import SERVER_STARTED_AT, get_version
from backend.shared.cafe24 import fetch_categories

router = APIRouter()


@router.get("/api/version")
def api_version():
    return {"version": get_version(), "started_at": SERVER_STARTED_AT}


@router.post("/api/admin/restart")
def api_restart():
    def restart_later():
        time.sleep(0.5)
        if shutil.which("pm2"):
            subprocess.Popen(["pm2", "restart", "catchup"])
            return

        subprocess.Popen(
            [sys.executable, *sys.argv],
            cwd=str(Path(__file__).resolve().parents[3]),
            env=os.environ.copy(),
            close_fds=True,
        )
        os._exit(0)

    threading.Thread(target=restart_later, daemon=True).start()
    return {"ok": True, "message": "서버 재시작을 요청했습니다."}


@router.get("/api/categories")
def api_categories():
    try:
        cats = fetch_categories()
        return [
            {
                "no": c["category_no"],
                "name": c["category_name"],
                "depth": c.get("category_depth", 1),
                "parent": c.get("parent_category_no"),
            }
            for c in cats
        ]
    except Exception as e:
        return JSONResponse(
            {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()},
            status_code=500,
        )
