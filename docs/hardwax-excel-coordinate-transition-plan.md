# 하드왁스 ExcelOrderView 좌표 전환 실행 계획

본 문서는 계획 문서이며, 이 커밋에서는 `frontend/src/pages/ExcelOrderView.tsx`, `frontend/src/pages/ExcelOrderView.css` 등 구현 파일을 수정하지 않는다.

## 1. 배경
현재 하드왁스 화면은 기존 운영 이력상 `R/C` 용어가 혼재되어 있었고, 수식 표시는 엑셀식(`=SUM(...)`)이지만 좌표 기준은 혼재되어 있었다.
요구사항 변경으로 화면과 데이터 레이어를 포함한 좌표 표현을 **엑셀 A1 단일 기준**으로 통일한다.

## 2. 최종 목표
1. 사용자에게 노출되는 모든 좌표(선택, 복사, 수식, 표시)는 Excel A1 형식(`D20`)으로만 처리
2. 기존 핵심 기능(선택 강조, 행/열 강조, sticky 정합성, 수식 표시)은 유지
3. Export/Import가 가능한 좌표 기반 메타를 `excelA1` 중심으로 정합화

## 3. 필수 정책 (반드시 준수)
1. canonical 모델에서 `screenRow`, `screenCol`, `screenA1` 제거
2. `CellSelectionMeta`는 `excelRow`, `excelCol`, `excelA1` 중심으로 재정의
3. 복사 동작은 A1 좌표만 반환 (`D20`)
4. 병행 표시(`R20/C6`) 제거
5. `screenA1 ↔ excelA1` 역매핑 표현 및 정책 제거(화면 셀 == Excel 셀)
6. `legacyRc`는 migration/debug용 보조 수단으로만 사용
   - 사용자 노출, 선택 문구, 복사, export/import 데이터에는 사용 금지

## 4. Stage 0: Coordinate Contract 작성

### 4.1 좌표 계약의 출발점
- 본 단계에서 좌표 계약을 **문서만으로 확정**한다.
- 이 단계는 실행 전 고정 기준을 정의하며, Stage 1~4는 이 계약에 정합되어야 한다.

### 4.2 컬럼 매핑표(필수)

| Excel 열 | colIndex | colKey | 화면 라벨 | 의미 | 수식 참조 가능 여부 |
|---|---:|---|---|---|---|
| A | 1 | `product_code` | 상품코드 | 행 식별/기본 텍스트 | N |
| B | 2 | `product_name` | 상품명 | 행 식별/표시 | N |
| C | 3 | `option_code` | 코드 | 행 식별/표시 | N |
| D | 4 | `option_name` | 옵션명 | 행 식별/표시 | N |
| E | 5 | `price` | 단가 | 단가 값 | N |
| F | 6 | `direct_qty` | 직접판매 | 직접판매 합계/값 | Y |
| G ~ N | 7 ~ (6 + U_COUNT) | `u_mapping_{i}` (i=1..U_COUNT) | U 매핑 컬럼 | LU 매핑 수량(원본 규칙 컬럼) | Y |
| N+1 | 7 + U_COUNT | `total_qty` | 총판매 | 직접판매 + U매핑 행합 | Y |
| N+2 | 8 + U_COUNT | `revenue` | 매출 | 직접판매 × L단가 + U매핑수량×U단가 합계 | Y |

- `U_COUNT`는 현재 렌더링 U 매핑 컬럼 개수(현재 세션 기준 변동 가능)
- N은 마지막 U 매핑 열의 Excel 열 인덱스
- `u_mapping_{i}`는 기존 `B:{uProduct}-{uVariant}` `colKey`의 정렬 기준에 따라 `G`부터 오른쪽으로 일대일 배치

### 4.3 대표 수식 충돌 해결 원칙
- 현재 기준에서 직접판매는 **F 열**로 확정한다.
- 과거 `=SUM(D10:D27)`은 예시 충돌이므로 향후 모든 직접판매 subtotal/total 수식은 `F` 열 기준으로 정의한다.
  - 예시: `=SUM(F10:F19)`
- 화면 열 머리글과 수식 열 참조는 항상 A1 계약을 따르며, 더 이상 `D열 직접판매` 규칙을 사용하지 않는다.
- 따라서 `500g subtotal` 등 직접판매 소계 수식은 모두 `=SUM(F10:F19)`으로 통일한다.

### 4.4 former R20/C6 환산표(필수)

| 기존 좌표 | 기존 의미 | 새 Excel A1 좌표 | 새 Excel 수식(기준) | 비고 |
|---|---|---|---|---|
| former `R20/C6` | 500g 총합계 행 / 직접판매 subtotal | `F20` | `=SUM(F10:F19)` | C열이 아니라 F열 기준으로 전환. 해당 행은 direct subtotal 행 타입 |

- 해당 행은 `subtotal:500g 총합계`(rowKey)로 취급할 것을 가정한다.
- `F20` 값은 계산값 표시 셀로 두며, 선택 시 수식은 subtotal 기여 행 범위를 A1로 전개한다.

### 4.5 행 매핑표(필수)

| Excel 행 | rowKey | rowType | 화면 의미 | group | 수식 대상 여부 |
|---:|---|---|---|---|---|
| 1 | `header:1` | header | 헤더 라인 | - | N |
| 2 | `header:2` | header | 헤더 라인 | - | N |
| 3 | `header:3` | header | 헤더/구분 라인 | - | N |
| 4 | `hardwax-u-direct` | uDirect | U상품 판매수 | U상품 | N |
| 10~19 | `parent:500g:{product_code}` / `variant:500g:{product_code}:{variant_code}` | product / variant | 500g 상품/옵션 데이터 | 500g | N |
| 20 | `subtotal:500g 총합계` | subtotal | 500g 직접판매 및 U매핑 소계 행 | 500g | Y |
| 21~29 | `parent:컵비즈:{product_code}` / `variant:컵비즈:{product_code}:{variant_code}` | product / variant | 컵비즈 상품/옵션 행 | 컵비즈 | N |
| 30~39 | `parent:1kg:{product_code}` / `variant:1kg:{product_code}:{variant_code}` | product / variant | 1kg 상품/옵션 데이터 | 1kg | N |
| 40 | `subtotal:1kg 총합계` | subtotal | 1kg 직접판매 및 U매핑 소계 행 | 1kg | Y |
| 41 | `total:grand` | total | 전체 합계 | 전체 | Y |

- 행 번호는 화면 렌더 순서 기반으로 고정되며, Stage 0 적용 시점의 계산된 결과를 기준으로 채택한다.

### 4.6 대표 수식표(Excel A1 기준)

| 셀 유형 | 예시 행(Key/rowType) | 예시 Excel 수식 |
|---|---|---|
| 500g 직접판매 subtotal | `subtotal:500g 총합계` | `=SUM(F10:F19)` 또는 실제 계약상 500g 기여 행 범위  `=SUM(F{start500} : F{end500})` |
| 500g U매핑 subtotal | `subtotal:500g 총합계` (열 G~N) | `=SUM(G10:G19)` 또는 `=SUM({uCol}{start500}:{uCol}{end500})` |
| 1kg 직접판매 subtotal | `subtotal:1kg 총합계` | `=SUM(F30:F39)` 또는 `=SUM(F{start1kg}:F{end1kg})` |
| 1kg U매핑 subtotal | `subtotal:1kg 총합계` (열 G~N) | `=SUM(G30:G39)` 또는 `=SUM({uCol}{start1kg}:{uCol}{end1kg})` |
| 상품행 총판매 | `parent:{group}:{product}` / `variant:{...}` | `=F{row}+SUM(G{row}: {lastUMappingCol}{row})` |
| 옵션행 총판매 | `variant:{group}:{product}:{variant}` | `=F{row}+SUM(G{row}: {lastUMappingCol}{row})` |
| 상품행 매출 | `parent:{group}:{product}` | `=F{row}*E{row}+{uCol1}{row}*{uPrice1}+{uCol2}{row}*{uPrice2}` |
| 옵션행 매출 | `variant:{group}:{product}:{variant}` | `=F{row}*E{row}+{uCol1}{row}*{uPrice1}+{uCol2}{row}*{uPrice2}` |
| 전체 합계 직접판매 | `total:grand` | `=SUM(F{subtotal500Start}:F{subtotal500End},F{subtotal1kgStart}:F{subtotal1kgEnd})` |
| 전체 합계 총판매 | `total:grand` | `=SUM({totalCol}{subtotalRows...})` |
| 전체 합계 매출 | `total:grand` | `=SUM({revenueCol}{subtotalRows...})` |

- `{lastUMappingCol}`: N(=6+U_COUNT) 열 문자.
- `{totalCol}`: 총판매 열(N+1).
- `{revenueCol}`: 매출 열(N+2).
- subtotal 행의 구간은 Stage 0에서 고정된 `subtotal 500g`, `subtotal 1kg` 행의 row 번호를 사용한다.

## 5. Stage 1: Internal ExcelGrid 도입

### 5.1 범위
- 내부 좌표 모델을 A1 기반으로 전환한다.

### 5.2 작업 항목
1. 모든 row/col 키 처리에서 `excelA1`, `excelRow`, `excelCol`을 canonical key로 유지
2. `CellSelectionMeta` 재정의(필요 시 `legacyRc`는 migration/debug만 보존)
3. 선택/하이라이트/수식 캐시 판별을 `excelRow`/`excelCol` 기준으로 통합
4. `data-*` 메타 속성도 `excelA1` 중심으로 정합

### 5.3 Stage 1 체크
- 기존 계산값 렌더와 수식 문구가 깨지지 않음
- 선택/강조/스크롤 연동이 이전과 동일한 사용자 감각 유지

## 6. Stage 2: UI를 Excel A1 좌표계로 전환

### 6.1 범위
- 테이블 자체 헤더/행 번호를 엑셀 좌표로 전면 표시

### 6.2 작업 항목
1. 열 헤더를 `A, B, C, ...`로 고정 표시
2. 좌측 행 헤더를 Excel 행 번호로 표시
3. 선택 상태 텍스트를 `선택: D20` 형태로만 표기
4. 수식 패널 좌표도 동일 A1 기준으로 표기

### 6.3 Stage 2 체크
- 셀 선택 시 표시 좌표가 테이블 헤더와 일치
- 수식에 쓰인 참조 좌표와 화면 헤더가 동일

## 7. Stage 3: R/C 제거

### 7.1 범위
- 렌더/선택/복사/수식/툴링에서 `R/C` 문자열, 표현, 상태 코드를 제거

### 7.2 작업 항목
1. 사용자-facing 텍스트에서 `R/C` 제거
2. 클립보드 복사 포맷을 A1만 반환
3. 내부에서 필요시 `legacyRc` 로그만 허용

### 7.3 Stage 3 체크
- 사용자 노출에서 `R/C` 0건
- 사용자 행동은 이전 플로우(클릭/복사/강조) 동일

## 8. Stage 4: Export/Import 준비

### 8.1 범위
- 엑셀 좌표를 canonical로 하는 직렬화/역직렬화 정책 수립

### 8.2 정책
- 화면 셀 = Excel 셀(동일 키)
- canonical key는 `excelA1`
- 영구 저장/Export/Import에서 `legacyRc` 사용 금지
- `legacyRc`는 migration/debug 로그에 한해 임시 기록만 허용
- import 순서: `excelA1`로 우선 매칭, 없으면 `rowKey/colKey`로 재매핑 재시도
- 행/열 삽입 발생 시 `rowKey/colKey` 기반으로 `excelRow/excelCol/excelA1`를 재계산
- 수식과 값은 모두 A1 기준 좌표로 직렬화

### 8.3 Stage 4 체크
- export/import 샘플에서 동일 좌표 키로 재현성 확보
- 화면 표시 좌표와 저장 좌표 일치

## 9. 검증 기준(최종 완료)
1. 선택 표시가 `R/C`가 아닌 A1 (`D20`) 형식
2. 복사 동작이 A1 반환
3. 수식 좌표와 화면 헤더 정합
4. 기존 선택 강조/행열 강조/sticky/수식 표시 기능 유지
5. 빌드 통과

## 10. 테스트 매트릭스 (AGENTS 반영)
- 정상
  1. 일반 셀, subtotal 셀, total 셀 선택
  2. A1 복사 확인
  3. 대표 수식 `=SUM(F10:F19)` 및 유형별 대표 수식 확인
  4. 헤더 정합: 열/행 헤더와 수식 참조 좌표 일치 확인
- 비정상
  1. 지원되지 않는 셀(수식 없는 값 셀) 선택 시 `값 셀`
  2. 역참조 불가 케이스에서 안정 fallback
- 오류/복구
  1. 데이터 갱신 실패 후 재렌더 시 선택 상태 정합성 복구
  2. export/import 실패 후 재시도 가이드 동작 확인

## 11. 리스크
- 행/열 번호 재정의 미스매치
  - 대응: Stage 0 좌표 표준표 고정 후 실행 전 회귀표 작성
- U 매핑 열 수가 바뀌는 경우
  - 대응: `U_COUNT` 기반 colIndex 재계산
- 기존 텍스트 기반 잔존 표현
  - 대응: Stage 3 게이트에서 표현 정합 검사

## 12. 완료 정의
- Stage 0~4를 순차 통과
- Coordinate Contract 기준의 대표 수식/행/열/환산표가 문서에 고정
- 사용자-facing `R/C` 표현 제거
- 실행 전 자체 점검 항목 통과 후 구현 착수 가능
