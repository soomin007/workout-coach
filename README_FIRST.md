# Workout Coach v9 handoff

이 묶음은 `workout_coach_unified_v9.html`을 다음 개발 환경(Claude Code 등)으로 넘기기 위한 기준 자료다.

## 가장 중요한 전제

- `current/workout_coach_unified_v9.html`은 현재 기준본이며 수정하지 않은 원본 사본이다.
- 기존 파일을 곧바로 부분 패치하지 말고, 먼저 `docs/REQUIREMENTS_AND_INVARIANTS.md`와 `docs/REGRESSION_TEST_PLAN.md`를 테스트로 고정한다.
- 기존 기능을 삭제하거나 단순화해서 문제를 피하지 않는다.
- 완료 판정은 설명이 아니라 실행 가능한 테스트와 실제 브라우저 검증 결과로 한다.
- 최종 사용 파일은 단일 HTML이어도 되지만, 개발 소스는 테스트 가능한 모듈로 분리해도 된다.

## 읽는 순서

1. `docs/PROJECT_CONTEXT.md`
2. `docs/KNOWN_ISSUES.md`
3. `docs/REQUIREMENTS_AND_INVARIANTS.md`
4. `docs/REGRESSION_TEST_PLAN.md`
5. `CLAUDE_CODE_START_PROMPT.md`
6. `current/workout_coach_unified_v9.html`

## 권장 첫 작업

1. Git 저장소를 초기화하고 v9 원본을 첫 기준 커밋으로 남긴다.
2. 현 상태에서 재현되는 실패 시나리오를 자동화한다.
3. 상태 계층을 `catalog defaults / persistent preferences / current session / completed history`로 분리한다.
4. 운동 교체를 단일 상태 전이 함수로 통합한다.
5. 단위 테스트와 실제 브라우저 테스트가 통과한 뒤 standalone HTML을 빌드한다.

## 이 묶음이 보장하지 않는 것

- v9가 정상 작동한다는 보증이 아니다.
- 문법 검사는 통과했지만 실제 사용자 흐름 전체가 검증된 것은 아니다.
- 아래 문서의 결함 목록은 확인된 항목이며, 가능한 모든 결함의 완전한 목록이라고 주장하지 않는다.

