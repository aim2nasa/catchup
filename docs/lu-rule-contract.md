# LU셀(교차점 매핑) 계약(최종 정의)

작성일: 2026-06-09

이 문서는 하드왁스 교차표의 **LU셀 판단 기준**을 1개로 통합 정리한다.

## 1) 핵심 정의

- `LU셀`은 **L 행(상품/옵션) × U 열(상품/옵션) 교차점에서 LU매핑이 정의된 셀**이다.
- 같은 L행×U열 조합에 대해 LU매핑 정의가 있으면 그 교차점은 **LU셀(확정)**이다.
- LU매핑 정의가 없으면 **LU셀 아님**이다.
- “값이 있는데 아직 LU 매핑이 정의되지 않은 셀”은 **LU 후보/미정의**로 분류되며, LU셀로 간주하지 않는다.

즉, 행-열 조합 단위의 **LU매핑 정의 존재 여부**가 LU셀 판단의 유일 기준이다.

- 판정식(기본):
  - `LU_CELL(row=L*, col=U*) = LU_CELL_MAPPING_DEFINED(L*, U*)`

핵심 추가 규칙:

- LU 여부는 수치 값(`0`, `>0`)이 아니라 **지정 상태**로 판단한다.
- `LU셀`은 `effectiveRules`(baseRules + userOverrides) 기준으로 판단한다.
- 하드코딩된 `RULES`는 초기 기준값으로 유지되며, 사용자 override는 별도 상태(`luOverrides`)로 덧붙여서 계산한다.

## 2) 화면 규칙과의 직접 정합

LU매핑 정의 유무는 화면 표현과 수식에 동일하게 반영한다.

- LU셀(정의됨) → 초록색 LU 확정 표시
- LU셀 없음 → 회색 LU 미정의 표시
- 예외(고정 제외 등) → 별도 예외 표시(예: 보라색)

## 3) 수식 규칙

- 매출 수식/설명 수식에서 LU 항은 **LU셀(교차점 정의된 셀)만** 포함한다.
- 수량이 0이어도 LU매핑이 정의된 셀이면 항은 삭제 없이 유지한다.
- LU셀 정의가 없는데 수식에 U항을 넣으면 안 된다.

## 4) 값(수량) 0의 의미

- LU매핑이 정의되어 있어도 수량이 0이면 계산 기여는 0이 되지만,
  **LU셀로서의 존재성은 그대로 유지**되어야 한다.
- LU매핑이 없는데 수량이 0이면 LU셀로 간주하지 않는다.

## 5) 적용 우선순위

아래 문서에서 충돌이 있을 경우 본 문서를 우선한다.

- [docs/hardwax-logical-structure.md](./hardwax-logical-structure.md)
- [docs/hardwax-planning-log.md](./hardwax-planning-log.md)
- [docs/hardwax-excel-coordinate-transition-plan.md](./hardwax-excel-coordinate-transition-plan.md)
