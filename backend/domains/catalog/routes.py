"""카테고리/버전 조회 라우트."""
import traceback

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.core.version import SERVER_STARTED_AT, get_version
from backend.shared.cafe24 import fetch_categories

router = APIRouter()


@router.get("/api/version")
def api_version():
    return {"version": get_version(), "started_at": SERVER_STARTED_AT}


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
