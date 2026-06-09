# Cafe24 옵션 단가 해석 계약 (하드왁스 고정 사용 규칙)

본 문서는 하드왁스 화면/집계에서 옵션 단가를 어떤 API 데이터로 확정할지에 대한 영구 규칙이다.
목표: 루프 단가 재해석(`매핑 수량>0` 여부)에 영향을 받지 않고, 항상 동일한 가격 원천을 쓰는 것.

## 1) 결론 요약

- 현재 Cafe24 Admin API는 조회한 스펙상 옵션별로 `product/variant` 단독 최종 판매가를 직접 내려주지 않는다.
- 따라서 옵션 단가를 계산할 때는 아래 규칙을 사용한다.
  - `U_variant_unit_price = product_price + variant_additional_amount`
- 이 규칙을 사용하면 가격값이 `0`인 문제는 “가격 조회 누락”이 아니라,
  `product_price` 또는 `additional_amount` 자체가 실제로 0인 케이스로만 발생한다.

## 2) 사용 API (현재 검증 완료)

1. 상품 기본정보 조회
   - `GET /api/v2/admin/products/{product_no}`
   - 또는 `GET /api/v2/admin/products?product_code={product_code}`
   - 사용 필드: `price`, `price_excluding_tax`
2. variant 목록 조회
   - `GET /api/v2/admin/products/{product_no}/variants`
   - 사용 필드: `variant_code`, `additional_amount`, `options`
3. variant 단건 조회(필요 시)
   - `GET /api/v2/admin/products/{product_no}/variants/{variant_code}`
   - 사용 필드: `variant_code`, `additional_amount`, `options`

## 3) 단가 산정 규칙(표준화)

- 기본식(옵션 단가)
  - `unitPrice(variant) = toNumber(product.price) + toNumber(variant.additional_amount)`
- `variant.additional_amount` 값이 문자열이면 숫자 변환.
- `product.price` 값이 비어있으면 `0`으로 처리하지 말고 진단 로그/경고를 남긴다.
- `additional_amount`만 0이더라도 `unitPrice`는 `product.price`로 계산된다.
- 같은 상품코드 내부에서 `variant_code`로 매핑해 조회해야 하며, 화면 표시값(예: 단일옵션의 `-`)은 내부 조인 키로 사용하지 않는다.

## 4) P00000QE 실제 조회 결과(2026-06-09 기준)

- 상품: `P00000QE`, `product_no = 420`, 상품기본가 `19,200`
- 옵션 variant:
  - `P00000QE000G` `additional_amount=0.00`
  - `P00000QE000H` `additional_amount=0.00`
  - `P00000QE000I` `additional_amount=0.00`
  - `P00000QE000J` `additional_amount=0.00`
  - `P00000QE000K` `additional_amount=0.00`
- 적용 단가
  - 각 variant의 적용 단가 = `19,200 + 0.00 = 19,200`

## 5) 하드왁스 매출 계산에서의 반영 포인트

- LU 매핑이 존재하면 수량이 0이더라도 수식 항은 유지한다(표시 목적 규칙).
- 단가 lookup 실패는 `단가미확인` 같은 표시와 함께 로그를 남겨
  실제 데이터 품질 이슈를 사용자가 바로 식별할 수 있게 한다.
- 매핑 행(`수식`) 계산 자체는 `qty`로 인해 0이 될 수 있어도,
  가격 소스 결손으로 `*0`이 임의로 붙는 형태는 피한다.

## 6) 점검 기준

- 배포/개발 시 아래를 함께 확인한다.
  1. 매핑/수식 생성은 `product_price` + `variant_additional_amount`로만 계산.
  2. `lookup 실패` 로그가 누락되지 않음.
  3. 동일 `variant_code`를 여러 경로에서 재조회해도 동일한 단가 산정값.
  4. 매핑이 있어도 수량 0 셀은 항으로만 유지하고, 가격은 임의로 0 보정하지 않음.

## 7) LU 가격 수집 플레이북 (운영용)

신뢰 가능한 가격 조회는 매핑/수식 처리와 분리해서 운영한다.  
UI에서 보이는 LU 셀수식은 항상 아래 가격 추출 규칙의 결과만 사용한다.

### 7.1 데이터 수집 절차

1. 대상 코드 집합 구성
   - 하드왁스에서 현재 쓰는 LU 정의에서 `uProduct`, `lProduct`를 추출한다.
   - 현재 기준(코드 스냅샷)에서는 총 32개(개별 L/U 코드)로 확인되었다.
2. 상품 기본 정보 조회
   - `GET /api/v2/admin/products?product_code={product_code}&embed=variants`
   - 응답의 상품 기본가(`price`)와 `variants`를 받는다.
3. 품목(옵션) 단가 보정
   - 각 품목 항목에서 `additional_amount`와 `variant_code`를 확인한다.
   - 최종 단가 후보: `effective = product.price + additional_amount`.
   - `product.price` 또는 `additional_amount`가 텍스트인 경우 숫자 변환 후 사용한다.
4. 실패 보정(강제 추적)
   - `variants` 내에 필수 필드가 비어 있거나, 가격 산출값이 존재하지 않으면
     `GET /api/v2/admin/products/{product_no}/variants`를 1회 추가 호출해 동일 `variant_code` 목록으로 보강한다.
   - 그래도 누락 시, 가격 미확인 항목으로 마킹하고 디버그 로그를 남긴다.
     (`product_code`, `variant_code`, `product_no`, `매핑정보` 모두 함께 기록)

### 7.2 API 계약 참고

- 공식 상품 품목 엔드포인트는 품목별 `additional_amount`를 제공한다. 단품별 최종 판매가는 별도 필드로 일관되게 노출되지 않는 케이스가 있으므로
  `product.price + additional_amount` 규칙을 계약으로 고정한다.
- 검증 근거(공식 문서): `additional_amount`가 “해당 품목 구매 시 상품 판매가에 더하는 추가 가격”으로 정의됨.
  (CAFE24 REST API Docs, Products Variants, `additional_amount`)

### 7.3 현재 운영 검증(샘플)

- P00000QE (U 상품, 요청한 샘플)
  - 기본가: 19,200
  - 옵션 `G/H/I/J/K` 가격 모두 19,200으로 수집됨
- 전체 LU 코드 스냅샷 기준(2026-06-09)
  - 대상 코드(32개) 전체 호출 성공
  - 수집된 품목 단가 합계 개수: 89개
  - 품목 단가 미확인(`null`) 없음
  - 품목 단가가 `0`으로 수집된 예외(현재 대상 기준) 없음

### 7.4 운영 체크리스트

1. 새 코드 추가 시 이 플레이북 경로로 1회 수집 후 `price_missing` 없이 적재되는지 확인
2. `단가 미확인` 로그가 있으면 즉시 LU 매핑 수식 표시 정책으로 상향 노출
3. 수식 생성은 매핑 존재 유무 기준이고, 수량 0 여부와 무관하게 항을 유지한다
