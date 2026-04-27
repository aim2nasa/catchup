"""Backward-compat shim. backend.main.app을 그대로 노출.

기존 진입점/스케줄러/외부 코드가 web/server.py를 import 하던 호환성 유지.
새 코드는 backend.main에서 직접 가져올 것.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.main import app  # noqa: F401, E402


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
