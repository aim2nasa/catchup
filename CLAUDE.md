# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 성격

캐치업코리아 법인의 업무를 분석하고 IT 기반 워크플로우로 개선하기 위한 프로젝트.

- 운영 도메인: cafe24 기반 쇼핑몰 (mall_id: lycon)
- 현행 업무: 판매 상품 관리가 별도 엑셀 파일 수기 방식으로 처리되고 있음
- 작업 방향: 업무 분석 → cafe24 OpenAPI 연동 → IT 자동화. 초기 산출물은 카테고리/매출 집계 웹 도구.
- 향후 계획: 회사 운영 사이트(주문/재고/CS/리포트/정산 등 전산 통합)로 점진 확장. 현 시점에서는 cafe24 매출 집계 웹앱 단일 도메인.

## 디렉토리 구조

- `backend/` — FastAPI 서버 (도메인 분리형)
  - `main.py` 진입점, `core/version.py` (git describe 기반 자동 버전), `shared/{aggregation,cafe24,excel_writer}.py` (재사용 로직), `domains/{catalog,sales}/routes.py` (도메인별 라우트)
- `frontend/` — Vite + React 19 + TypeScript 신규 프론트엔드 (마이그레이션 진행 중)
  - `src/api/client.ts` (fetch 헬퍼 + 타입), `src/App.tsx` 등
  - 빌드: `npm run build` → `frontend/dist/`
  - dev: `npm run dev` (port 5173, /api → backend 8000 proxy)
- `web/` — 레거시 운영 UI 위치 (점진 폐기 예정)
  - `static/index.html` 단일 파일 SPA — 현재 운영 화면
  - `server.py` / `aggregation.py` — 모두 `backend.*` 재export shim (구진입점 호환용)
- `tests/` — Python 회귀 테스트
  - `test_api_regression.py` (FastAPI TestClient + cafe24 mock)
  - `fixtures/cafe24_*.json` (응답 픽스처)
- `python/cafe24/` — 초기 cafe24 API 연동 자료 / 연습 코드
  - `CONTEXT.md` `필드명-매핑.md` 참고 문서
  - `tests/cafe24_*.py` 인증/조회 스크립트, `keepalive.py` (Windows 작업 스케줄러로 주 1회 토큰 자동 갱신)
  - `tests/test_aggregation.py` aggregation 단위 테스트
- `docs/` — 현행 업무 참고 자료 (엑셀 양식 등)

## 환경

- OS: Windows. Python 실행 시 `py` 런처 사용 (`python` 미설치 가능성).
- Python 3.13.x. 의존: `fastapi`, `uvicorn`, `requests`, `openpyxl`, `python-dotenv`.
- Node.js 22.x. `frontend/` 의존은 Vite + React 19 + TypeScript + @tanstack/react-query.
- cafe24 자격증명(`token.json`, `.env`)은 `.gitignore`로 차단됨. 절대 커밋 금지.
- cafe24 OpenAPI 연동 패턴은 `python/cafe24/CONTEXT.md`, 필드명 매핑은 `python/cafe24/필드명-매핑.md` 참고.

## 빌드 / 실행 / 테스트 명령

### 백엔드 실행 (개발)
```
py backend/main.py
# 127.0.0.1:8000
```

### 프론트엔드 dev (별도 터미널)
```
cd frontend
npm install      # 최초 1회
npm run dev      # 127.0.0.1:5173, /api → 8000 proxy
```

### 프론트엔드 build (운영)
```
cd frontend
npm run build    # frontend/dist/ 산출
```

`backend/main.py`는 `frontend/dist/index.html` 존재 여부로 라우팅을 분기:
- **dist 있음**: `/` → 신규 React UI 서빙, `/legacy` → 옛 정적 UI
- **dist 없음**: `/` → 옛 정적 UI fallback

⇒ 운영 모드는 `npm run build` 후 `py backend/main.py` 만 띄우면 됨.
⇒ 개발 모드는 backend(8000) + `npm run dev`(5173)를 양쪽에서 띄우고
  /api는 vite proxy로 8000으로 포워딩. dist를 매번 빌드할 필요 없음.

### 회귀 테스트 (Python, 40건)
```
py tests/test_api_regression.py            # 14건 — API endpoint 회귀 (cafe24 mock)
py python/cafe24/tests/test_aggregation.py # 26건 — 집계/정렬 로직 단위 테스트
```

### E2E 테스트 (Playwright, 3건)
```
npx playwright test                # baseline 3건 (~11초, 실 cafe24 호출 1건 포함)
npx playwright test --ui           # UI 모드로 디버깅
```
- baseline 시나리오: 페이지 로드 + 카테고리 + 버전 / 전체해제+조회 alert / 짧은기간 실조회 → 결과 요약 + 모드 토글
- 사전 조건: `frontend/dist`가 빌드되어 있어야 React UI 검증 가능 (`cd frontend && npm run build`).
  Playwright 설정에 `webServer.command = "py backend/main.py"`로 백엔드 자동 기동.
- cafe24 호출 시나리오는 토큰이 만료되면 실패 — `cafe24-token-keepalive` 작업 스케줄러로 주 1회 자동 갱신 중.

### 자동 토큰 갱신 (Windows 작업 스케줄러)
이미 등록되어 있음 (이름: `cafe24-token-keepalive`). 매주 월요일 09:00 실행.
재등록 필요 시:
```
schtasks /create /tn "cafe24-token-keepalive" /tr "py D:\catchup\python\cafe24\tests\keepalive.py" /sc weekly /d MON /st 09:00 /f
```

## 버전 체계

- `git describe --always --dirty --tags` 기반 자동 산출
- 마일스톤만 수동 태그 (예: `git tag v0.1.0`)
- 커밋마다 자동 증가: `v0.1.0-N-g<sha>` (N=태그 이후 커밋 수)
- 미커밋 변경 있으면 끝에 `-dirty` 자동 부여
- 웹 UI footer 및 `/api/version` 엔드포인트로 노출

## 작업 시 고려사항

- "엑셀 업무를 그대로 자동화"하기보다, 그 엑셀이 무엇을 위해 존재하는지(어떤 의사결정/리포트를 위한 것인지)를 먼저 파악한 뒤 개선안을 제안할 것. 현행 양식의 단순 복제는 피한다.
- 도메인 이해가 깊어지거나 워크플로우 결정이 내려지면 `README.md`의 "현재 파악된 상황" 항목과 관련 `CONTEXT.md`를 함께 갱신.
- 백엔드 변경 시 `tests/test_api_regression.py` 통과 여부 확인. 의도적 동작 변경은 테스트 fixture/expected 함께 갱신.
- 집계 로직 수정 시 `test_aggregation.py` 통과 여부 확인 (현재 26건).
- 프론트엔드 마이그레이션 진행 중: 운영 UI는 `web/static/index.html`을 백엔드가 직접 서빙. 신규 React UI(`frontend/`)는 dev에서 5173에서 가동, 추후 build 산출물(`frontend/dist/`)을 백엔드가 서빙하도록 전환 예정.
- 시크릿 보호: 자격증명(CLIENT_SECRET, ACCESS_TOKEN, REFRESH_TOKEN)은 `.env`/`token.json`에만 보관. 코드/커밋에 절대 포함 금지.
