import os
import json
import requests
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

MALL_ID = os.environ["CAFE24_MALL_ID"]
CLIENT_ID = os.environ["CAFE24_CLIENT_ID"]
CLIENT_SECRET = os.environ["CAFE24_CLIENT_SECRET"]
TOKEN_FILE = Path(__file__).parent / "token.json"


def _load():
    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data):
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _is_expired(expires_at_str):
    # 만료 1분 전부터 갱신 (여유 마진)
    expires_at = datetime.fromisoformat(expires_at_str).replace(tzinfo=timezone(timedelta(hours=9)))
    now = datetime.now(timezone(timedelta(hours=9)))
    return now >= expires_at - timedelta(minutes=1)


def _refresh(refresh_token):
    url = f"https://{MALL_ID}.cafe24api.com/api/v2/oauth/token"
    res = requests.post(
        url,
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "refresh_token", "refresh_token": refresh_token},
    )
    res.raise_for_status()
    new_token = res.json()
    _save({
        "access_token": new_token["access_token"],
        "refresh_token": new_token["refresh_token"],
        "expires_at": new_token["expires_at"],
    })
    print("[INFO] access_token 자동 갱신 완료")
    return new_token["access_token"]


def get_access_token():
    """만료되었으면 자동 갱신해서 유효한 access_token 반환"""
    token = _load()
    if _is_expired(token["expires_at"]):
        return _refresh(token["refresh_token"])
    return token["access_token"]
