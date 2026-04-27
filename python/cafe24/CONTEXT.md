# Cafe24 API 연동 프로젝트 컨텍스트

## 프로젝트 개요

Cafe24 쇼핑몰의 상품 정보를 외부 스크립트에서 조회하기 위한 API 연동 작업.
OAuth 2.0 기반 Public App 방식으로 인증하고, Python(`requests`)으로 호출한다.

## 환경

- **OS**: Windows (PowerShell)
- **Python**: 3.13.3
- **작업 디렉토리**: `D:\LyconCafe24`
- **Python 실행**: `py` 명령 사용 (`python` 아님)

## 인증 정보

| 항목 | 값 |
|------|----|
| Mall ID | `lycon` |
| Client ID | `where54m003oeqPH3kGftR` |
| Client Secret | (별도 보관, 코드에 하드코딩됨) |
| Redirect URI | `https://lycon.cafe24.com/callback` |
| Scope | `mall.read_product` |
| 개발자센터 계정 | `koenig911` |
| 쇼핑몰 운영자 계정 | `lycon` |

## 도메인 구조

- 쇼핑몰: `lycon.cafe24.com`
- API: `lycon.cafe24api.com`
- 개발자센터: `developers.cafe24.com`

## OAuth 흐름

1. **Authorization Code 발급** (브라우저)
   ```
   https://lycon.cafe24api.com/api/v2/oauth/authorize
     ?response_type=code
     &client_id={CLIENT_ID}
     &state=test1234
     &redirect_uri=https://lycon.cafe24.com/callback
     &scope=mall.read_product
   ```
   → 리다이렉트 URL의 `code` 파라미터 추출 (1분 내 사용)

2. **Access Token 교환**
   - 엔드포인트: `POST /api/v2/oauth/token`
   - Auth: `Basic (client_id:client_secret)`
   - Body: `grant_type=authorization_code&code=...&redirect_uri=...`
   - 응답: `access_token`(2시간), `refresh_token`(2주)

3. **Refresh Token 갱신**
   - Body: `grant_type=refresh_token&refresh_token=...`
   - 갱신 시 **refresh_token도 새로 발급되며 기존 것은 무효화**됨
   - 새 값 즉시 저장 필수

## 토큰 저장 구조 (`D:\token.json`)

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2026-04-27T07:53:14.000"
}
```

`expires_at`은 access_token 만료 시각 (KST, UTC+9). Cafe24가 `+09:00` 기준으로 반환.

## 파일 구조

```
D:\LyconCafe24\
├── cafe24_auth.py              # 토큰 자동 갱신 모듈 (공통)
├── cafe24_token.py             # 최초 토큰 발급 (code 입력)
├── cafe24_refresh.py           # 수동 refresh 테스트용
├── cafe24_product_by_code.py   # 상품코드(P로 시작)로 조회
├── cafe24_variant_by_code.py   # 품목코드(P+옵션)로 조회 (재고 포함)
└── token.json                  # 토큰 저장 (gitignore 대상)
```

## 핵심 모듈: `cafe24_auth.py`

만료 1분 전 자동 갱신 구조. 다른 스크립트는 `from cafe24_auth import get_access_token, MALL_ID`로 사용.

```python
import requests
import json
from datetime import datetime, timezone, timedelta

MALL_ID = "lycon"
CLIENT_ID = "where54m003oeqPH3kGftR"
CLIENT_SECRET = "..."  # 실제 값
TOKEN_FILE = "D:/token.json"

def _load():
    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def _save(data):
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _is_expired(expires_at_str):
    expires_at = datetime.fromisoformat(expires_at_str).replace(
        tzinfo=timezone(timedelta(hours=9))
    )
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
    token = _load()
    if _is_expired(token["expires_at"]):
        return _refresh(token["refresh_token"])
    return token["access_token"]
```

## API 사용 패턴

### 상품 (Product) - `P00000ZB` 같은 형태

```http
GET /api/v2/admin/products?product_code=P00000ZB
```
- 상품번호로 직접 조회: `GET /api/v2/admin/products/{product_no}`
- 응답 필드: `product_no`, `product_code`, `product_name`, `price`, `display`, `selling` 등

### 품목 (Variant) - `P00000ZB000A` 같은 형태 (옵션별)

품목코드 단독 조회 API는 없음. **상품번호 하위에서 목록 조회 후 필터링**.

```http
GET /api/v2/admin/products/{product_no}/variants
```
- 응답: `variant_code`, `options`, `quantity`(재고), `safety_inventory`, `display`, `selling` 등
- **재고 정보가 variant 응답에 이미 포함됨** → 별도 inventories API 호출 불필요 (단일 창고 기준)
- 다중 창고 분배 재고 필요 시: `GET /products/{product_no}/variants/{variant_code}/inventories` (별도 권한 필요할 수 있음)

### 호출 패턴 (variant 조회)

```python
# 1) product_code → product_no 변환
res1 = requests.get(f"{base}/products", headers=headers, params={"product_code": product_code})
product_no = res1.json()["products"][0]["product_no"]

# 2) variants 목록에서 원하는 코드 필터
res2 = requests.get(f"{base}/products/{product_no}/variants", headers=headers)
target = next((v for v in res2.json()["variants"] if v["variant_code"] == variant_code), None)
```

## 주의사항

1. **PowerShell에서 `curl`은 별칭** → `curl.exe` 명시 필요
2. **CLIENT_SECRET에 한글 placeholder 남기면** `latin-1` 인코딩 에러 발생
3. **Authorization Code는 1분 만료** → curl로 손복붙은 비현실적, Python `input()` 방식 권장
4. **App URL/Redirect URI에 `localhost`/IP 불가** → 실제 도메인 필수
5. **Scope 변경 시** 기존 토큰 무효 → 인증 URL 재접속 → 새 token.json 발급 필요
6. **출력 시 한글 깨짐 방지**: `json.dumps(data, indent=2, ensure_ascii=False)`

## 용어 정리

| 용어 | 형식 | 설명 |
|------|------|------|
| 상품번호 (product_no) | 정수 (예: 651) | 내부 식별자 |
| 상품코드 (product_code) | `P` + 7자리 (예: `P00000ZB`) | 사용자 식별자 |
| 품목코드 (variant_code) | 상품코드 + 옵션 4자리 (예: `P00000ZB000A`) | 옵션별 SKU |

## 다음 단계 후보

- [ ] CLIENT_SECRET 환경변수 분리 (`.env` + `python-dotenv`)
- [ ] 다중 상품/품목 일괄 조회 (페이지네이션 처리)
- [ ] 결과 CSV/엑셀 저장
- [ ] `embed=variants,options,images` 파라미터로 한 번에 가져오기
- [ ] 추가 scope (주문, 고객, 재고 분배 등)
- [ ] 에러 로깅 및 재시도 로직
