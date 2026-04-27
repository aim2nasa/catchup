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
TOKEN_FILE = Path(__file__).parent / "token.json"

with open(TOKEN_FILE, "r", encoding="utf-8") as f:
    refresh_token = json.load(f)["refresh_token"]

url = f"https://{MALL_ID}.cafe24api.com/api/v2/oauth/token"
res = requests.post(
    url,
    auth=(CLIENT_ID, CLIENT_SECRET),
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data={
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    },
)
print(res.status_code)
print(json.dumps(res.json(), indent=2, ensure_ascii=False))
