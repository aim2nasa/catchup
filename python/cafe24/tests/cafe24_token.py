import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

MALL_ID = os.environ["CAFE24_MALL_ID"]
CLIENT_ID = os.environ["CAFE24_CLIENT_ID"]
CLIENT_SECRET = os.environ["CAFE24_CLIENT_SECRET"]
REDIRECT_URI = os.environ["CAFE24_REDIRECT_URI"]
TOKEN_FILE = Path(__file__).parent / "token.json"

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
