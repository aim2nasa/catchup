"""카테고리/버전 조회 라우트."""
import json
import os
import shutil
import subprocess
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
    dev_restart_file = os.environ.get("CATCHUP_DEV_RESTART_FILE")
    if dev_restart_file:
        restart_path = Path(dev_restart_file)
        restart_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = restart_path.with_suffix(restart_path.suffix + ".tmp")
        tmp_path.write_text(
            json.dumps(
                {
                    "requested_at": time.time(),
                    "mode": "dev-supervisor",
                    "version": get_version(),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        tmp_path.replace(restart_path)
        return {
            "ok": True,
            "mode": "dev-supervisor",
            "message": "개발 서버 재시작을 요청했습니다. 백엔드가 준비될 때까지 잠시 기다려주세요.",
        }

    def restart_later():
        time.sleep(0.5)
        if shutil.which("pm2"):
            subprocess.Popen(["pm2", "restart", "catchup"])

    if shutil.which("pm2"):
        threading.Thread(target=restart_later, daemon=True).start()
        return {"ok": True, "mode": "pm2", "message": "서버 재시작을 요청했습니다."}

    return JSONResponse(
        {
            "ok": False,
            "error": (
                "현재 실행 모드에서는 안전한 서버 재시작을 수행할 수 없습니다. "
                "개발 환경에서는 프로젝트 루트에서 `npm run dev`로 실행한 뒤 다시 시도하세요."
            ),
        },
        status_code=409,
    )


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
