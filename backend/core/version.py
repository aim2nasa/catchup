"""앱 버전 + 시작 시각 헬퍼. git describe 기반 자동 산출."""
import subprocess
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SERVER_STARTED_AT = datetime.now().isoformat(timespec="seconds")


def get_version() -> str:
    """git describe로 자동 산출. 태그 없으면 짧은 SHA, dirty 시 -dirty 접미."""
    try:
        return subprocess.check_output(
            ["git", "describe", "--always", "--dirty", "--tags"],
            cwd=str(ROOT), text=True, stderr=subprocess.DEVNULL,
        ).strip() or "unknown"
    except Exception:
        return "unknown"
