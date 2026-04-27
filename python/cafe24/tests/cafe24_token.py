import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import json
import platform
import subprocess
import requests
from pathlib import Path
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

MALL_ID = os.environ["CAFE24_MALL_ID"]
CLIENT_ID = os.environ["CAFE24_CLIENT_ID"]
CLIENT_SECRET = os.environ["CAFE24_CLIENT_SECRET"]
REDIRECT_URI = os.environ["CAFE24_REDIRECT_URI"]
TOKEN_FILE = Path(__file__).parent / "token.json"
KEEPALIVE = Path(__file__).parent / "keepalive.py"
TASK_NAME = "cafe24-token-keepalive"


def register_keepalive_task():
    if platform.system() != "Windows":
        return
    cmd = [
        "schtasks", "/create", "/f",
        "/tn", TASK_NAME,
        "/tr", f'py "{KEEPALIVE}"',
        "/sc", "weekly", "/d", "MON", "/st", "09:00",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="cp949", errors="replace")
        if result.returncode == 0:
            print(f"[INFO] 작업 스케줄러 등록: {TASK_NAME} (매주 월 09:00)")
        else:
            msg = (result.stderr or result.stdout or "").strip()
            print(f"[WARN] 스케줄러 등록 실패 (returncode={result.returncode}): {msg}")
    except FileNotFoundError:
        print("[WARN] schtasks 명령을 찾을 수 없음 (Windows 외 환경?)")


code = input("code 값을 붙여넣고 엔터: ").strip()

url = f"https://{MALL_ID}.cafe24api.com/api/v2/oauth/token"
res = requests.post(
    url,
    auth=(CLIENT_ID, CLIENT_SECRET),
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    },
)
res.raise_for_status()
data = res.json()
print(res.status_code)
print(json.dumps(data, indent=2, ensure_ascii=False))

with open(TOKEN_FILE, "w", encoding="utf-8") as f:
    json.dump({
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": data["expires_at"],
    }, f, indent=2, ensure_ascii=False)
print(f"\n[INFO] token.json 저장 완료: {TOKEN_FILE}")

register_keepalive_task()
