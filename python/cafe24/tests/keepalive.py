import sys
sys.stdout.reconfigure(encoding="utf-8")

from datetime import datetime
from cafe24_auth import get_access_token

token = get_access_token()
print(f"[{datetime.now().isoformat(timespec='seconds')}] keepalive OK  token={token[:8]}...")
