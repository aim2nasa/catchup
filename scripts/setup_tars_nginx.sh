#!/usr/bin/env bash
# tars.giize.com nginx에 /catchup/ reverse proxy를 추가/갱신.
#
# 사용 (서버에서 직접):
#   cd ~/catchup
#   sudo bash scripts/setup_tars_nginx.sh
#
# 멱등 (idempotent): 이미 catchup 블록이 들어있으면 새 내용으로 교체.
#
# 동작:
#   1) /etc/nginx/sites-enabled/tars 백업
#   2) BEGIN catchup-block ~ END catchup-block 마커 사이를 nginx-catchup.conf로 교체
#   3) 마커가 없으면 마지막 } 직전에 새로 삽입
#   4) nginx -t 검증 후 reload
#   5) 외부 https://tars.giize.com/catchup/api/version 검증

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "이 스크립트는 root(sudo)로 실행해야 합니다."
  echo "예: sudo bash $0"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE="/etc/nginx/sites-enabled/tars"
SNIPPET="$REPO_DIR/docs/nginx-catchup.conf"
BEGIN_MARK="    # === BEGIN catchup-block (managed by scripts/setup_tars_nginx.sh) ==="
END_MARK="    # === END catchup-block ==="

if [[ ! -f "$NGINX_SITE" ]]; then
  echo "❌ $NGINX_SITE 가 없습니다."
  exit 1
fi
if [[ ! -f "$SNIPPET" ]]; then
  echo "❌ $SNIPPET 이 없습니다."
  exit 1
fi

BACKUP="${NGINX_SITE}.bak.$(date +%Y%m%d_%H%M%S)"
cp "$NGINX_SITE" "$BACKUP"
echo "📦 백업 저장: $BACKUP"

python3 - "$NGINX_SITE" "$SNIPPET" "$BEGIN_MARK" "$END_MARK" <<'PY'
import re, sys
path, snippet_path, begin, end = sys.argv[1:5]
with open(path, 'r', encoding='utf-8') as f:
    txt = f.read()
with open(snippet_path, 'r', encoding='utf-8') as f:
    snippet = f.read().rstrip()

block = f"\n{begin}\n{snippet}\n{end}\n"

if begin in txt and end in txt:
    # 기존 블록 교체
    pattern = re.compile(re.escape(begin) + r".*?" + re.escape(end) + r"\n?", re.DOTALL)
    new_txt = pattern.sub(block, txt)
    print("🔁 기존 catchup-block 갱신")
else:
    # 마지막 } 직전에 삽입
    idx = txt.rfind('}')
    if idx == -1:
        sys.exit('❌ nginx 설정에 닫는 } 가 없음')
    new_txt = txt[:idx] + block + txt[idx:]
    print("➕ catchup-block 신규 삽입")

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_txt)
PY

echo "🔍 nginx 구문 검증"
if ! nginx -t; then
  echo "❌ nginx -t 실패. 백업으로 롤백:"
  cp "$BACKUP" "$NGINX_SITE"
  nginx -t || true
  exit 1
fi

echo "♻️  nginx reload"
systemctl reload nginx

echo
echo "🌐 외부 접속 검증 (https://tars.giize.com/catchup/api/version)"
sleep 1
if curl -sf --max-time 10 https://tars.giize.com/catchup/api/version; then
  echo
  echo "✅ 성공. 브라우저: https://tars.giize.com/catchup/"
else
  echo
  echo "⚠️  외부 검증 실패. 로컬에서 추가 확인:"
  curl -sf --max-time 5 http://127.0.0.1:8300/api/version || echo "  로컬 백엔드 응답 없음 — pm2 status catchup 확인"
fi
