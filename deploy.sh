#!/usr/bin/env bash
# catchup 배포 스크립트 (tars / Linux Ubuntu)
#
# 사용:
#   서버 직접:    cd ~/catchup && ./deploy.sh
#   로컬에서:     ssh rossi@100.110.215.65 'cd ~/catchup && ./deploy.sh'
#
# 동작:
#   1) git pull
#   2) python 의존성 (--user)
#   3) frontend npm install (lock 변경 시) + build
#   4) PM2로 catchup 서비스 restart (없으면 start)

set -euo pipefail

cd "$(dirname "$0")"

echo "[1/4] git pull"
git pull --ff-only

echo "[2/4] Python 의존성 (venv)"
if [[ ! -d .venv ]]; then
  echo "  .venv 생성"
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade --quiet pip
.venv/bin/pip install --upgrade --quiet fastapi uvicorn requests openpyxl python-dotenv

echo "[3/4] frontend build"
cd frontend
if [[ package-lock.json -nt node_modules/.package-lock.json ]] || [[ ! -d node_modules ]]; then
  echo "  npm install (lock 변경 감지)"
  npm install
fi
npm run build
cd ..

echo "[4/4] PM2 reload"
if pm2 describe catchup > /dev/null 2>&1; then
  pm2 restart catchup --update-env
else
  pm2 start ".venv/bin/python backend/main.py" \
    --name catchup \
    --cwd "$PWD" \
    --interpreter none
  pm2 save
fi

echo
echo "완료. 상태:"
pm2 describe catchup | grep -E "name|status|cwd|uptime|restarts" | head -8 || true
echo
echo "접속: http://$(hostname -I | awk '{print $1}'):8000"
