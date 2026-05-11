# 운영 / 개발 lessons

작업하면서 부딪힌 버그와 그 근본 원인, 재발 방지 교훈을 시간순으로 기록.
새 lesson은 위쪽(최신)에 추가.

---

## 2026-05-11 — 카테고리 무관 product를 카테고리로 조회해서 누락

### 증상
하드왁스 페이지(`#hardwax`)에서 P0000BMJ(선샤인 비즈왁스 800g, 1박스 18개)가
"—" placeholder로 표시. 그런데 cafe24 어드민 "판매상품 순위"에서 같은 기간으로
조회하면 결제 4건 / 매출 1,440,000원이 정상 잡힘.

### 원인
하드왁스 페이지가 backend의 `/api/report?categories=24` 를 호출 → backend는
cafe24 `/products?category=24` 로 카테고리 24의 상품 26개만 가져옴.
**P0000BMJ는 cafe24에서 카테고리 189/191에 속해 있어 응답에서 빠짐.**

PRODUCT_CODES 23개 중 일부는 다른 카테고리에 분류되어 있는데, 페이지 초기
구현 때 "하드왁스 페이지 = 카테고리 24" 라는 암묵적 가정으로 짜여 있었음.

### 왜 cafe24 어드민에선 정상 표시됐나
cafe24의 "판매상품 순위" 화면은 카테고리 필터 없이 product_code 검색으로
동작 — 카테고리 매핑 무관. 우리 페이지는 카테고리 기반 조회였기 때문에
이 차이가 드러나지 않다가 P0000BMJ 케이스에서 드러남.

### 해결
backend에 카테고리 키 대신 product_code를 키로 쓰는 새 SSE endpoint를
추가:

```
GET /api/products-report?start=YYYY-MM-DD&end=YYYY-MM-DD&codes=A,B,C
```

- `cafe24.fetch_products_by_codes(codes)`: code마다 `/products?product_code=X`
  단건 호출. 카테고리 매핑이 어떻게 바뀌든 무관.
- 응답 shape는 `/api/report` 와 동일하므로 frontend `useReport` 훅을
  discriminated union 으로 확장(`{categories}` | `{codes}`)해서 재사용.
- 하드왁스 페이지(ExcelOrderView)가 `{codes: GROUPS.flatMap(...)}` 로 호출.

기존 `/api/report` (sales 페이지 사용)는 영향 없음 — 신규 endpoint만 추가.

### 교훈
1. **표시 대상 코드 집합과 cafe24 카테고리는 별개 축이다.** "이 코드들은 모두
   같은 카테고리에 있을 것"이라는 가정은 cafe24 운영에 따라 언제든 깨질
   수 있다. 카테고리 매핑은 사용자가 cafe24 어드민에서 자유롭게 바꿈.
2. **선언적 코드 리스트가 운영 정의면, 카테고리 우회로 가지 말고 코드 키로
   직접 조회하라.** "엑셀에 적힌 순서대로의 코드 집합" 같은 운영 정의가
   있으면, cafe24 카테고리는 그 정의의 대체 키로 적합하지 않다.
3. **누락 가능 데이터는 미리 진단하라.** 새 코드 리스트를 추가할 때 23개
   각각이 어느 카테고리에 있는지 한 번 cafe24 응답으로 확인해 봤으면 같은
   날 잡혔을 버그. "—" placeholder가 있다는 건 두 가지 다른 의미를 합친
   상태였음:
   - (a) cafe24에 진짜 없는 코드 (P0000BLD)
   - (b) 다른 카테고리에 있는 코드 (P0000BMJ)
   placeholder만 보고 둘을 구분할 수 없었다. 같은 placeholder를 두 의미로
   쓰면 디버깅이 늦어진다.

### 관련 커밋
- `578c729` 카테고리 무관 product_code 직접 조회로 변경
- `49eb54a` 응답 없는 코드도 placeholder 행으로 표시 (placeholder 도입)

---

## 2026-05-11 — cafe24 /reports/salesvolume 의 product 단위 N+1 (revert됨)

### 증상
판매수량을 "환불 차감 후 값"으로 정확히 가져오려고 cafe24의
`/reports/salesvolume` endpoint를 product_no 단위로 호출하도록 변경.
하드왁스 카테고리 26개 상품에 대해 N+1 호출이 발생 → 카테고리 24 조회
시 5분 이상 hang.

### 원인
`/reports/salesvolume` 은 `product_no` 또는 `item_code` 가 필수 파라미터.
즉 한 번 호출에 한 상품만. 카테고리 N개 상품 + 각 상품마다 페이지네이션
때문에 사실상 N+M 호출. cafe24 rate limit과 직렬 호출로 분 단위 hang.

### 해결
`/reports/salesvolume` 접근 폐기(revert), `/orders` 한 번 호출 + 응답에서
`order_status` 가 `C`(취소) / `R`(반품) / `F`(실패) 로 시작하는 라인을
판매수량에서 제외하는 방식으로 변경. 실데이터 검증으로 P00000HT 4월
환불 4건이 `order_status="C40"` 두 라인(qty 1+3)으로 표현됨을 확인.

### 교훈
1. **API 한 번에 product 1개씩 받는 endpoint를 카테고리 전체에 사용하면
   N+1이 된다.** N이 작아도 cafe24 rate limit 때문에 직렬 호출 시 분
   단위로 늘어남. 사용 전에 "이 endpoint를 한 페이지 렌더에 몇 번
   호출하게 될까?"를 먼저 계산하라.
2. **새로운 endpoint를 도입하기 전에 기존 endpoint의 응답 필드를 다시
   살펴보라.** `/orders` 응답에 환불 정보가 이미 `order_status` 로 표시
   되고 있었는데, 처음엔 `claim_quantity` 가 항상 0이라 못 잡았던 것.
   raw 응답을 한 번 더 정밀 진단(실제 환불된 주문 한 건의 모든 필드
   보기)했으면 새 endpoint 없이 끝났을 일.

### 관련 커밋
- `64fda47` 시도 (revert됨)
- `b39c496` revert
- `ab67b83` order_status 필터로 재구현

---

## 2026-05-11 — 묶음/옵션 상품의 단가가 product_price 아닌 option_price 에 들어옴

### 증상
P0000BIF (비즈 왁스 4종) 등 묶음/옵션 상품의 매출이 ₩0 으로 표시. 단가도
₩0.

### 원인
cafe24 order item 응답에서 묶음할인/옵션 상품은 `product_price=0`,
실제 단가가 `option_price` 에 들어옴 (실데이터: option_price 40,000~206,000).
우리 aggregation 이 `product_price` 만 사용해서 매출 0.

단가 0은 cafe24 catalog의 multi-variant parent product 가격이 0 (옵션별로
다양해서) — cafe24 의도된 동작이지만 사용자에게는 의미 없는 표시.

### 해결
- aggregation: 매출 = `qty × (product_price + option_price)`
- variant마다 unit_price 추적 → 응답 `variants[].price` 노출
- multi parent: catalog price 0 이고 variant 단가가 모두 동일하면 그 값을
  effective price로 promote. 다양하면 0 유지 → frontend가 "옵션별" 라벨로
  표시 (의미 없는 ₩0 노출 방지).

### 교훈
1. **fixture 샘플이 부분적이면 결제 형태의 다양성을 다 못 잡는다.** 우리
   fixture(`cafe24_orders_small.json`) 5건은 일반 결제 + 옵션 결제가
   섞여 있었는데, 옵션 결제의 `product_price=0` 케이스를 회귀 테스트에
   명시적으로 넣지 않았어서 묶음 매출 누락이 fixture만 보고선 안 보였음.
   회귀 fixture 에 "각 결제 형태가 적어도 1건씩 들어있다"를 보장하라.
2. **0이 의미 있는 값인지 아닌지를 frontend에서 분기하라.** cafe24 응답
   ₩0을 그대로 ₩0으로 표시하면 사용자는 "잘못 계산했다"고 인식. 의미
   없는 0(예: 다양한 단가가 합쳐진 parent)은 "옵션별" 같은 라벨로 명시.
3. **상품 가격은 한 필드가 아니라 `product_price + option_price` 의 합이다**
   — cafe24 데이터를 처음 다룰 때 명심.

### 관련 커밋
- `e236365` 묶음/옵션 상품 단가·매출 표시 수정
