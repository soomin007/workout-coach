# Claude Code 시작 프롬프트

아래 내용을 새 Claude Code 세션의 첫 요청으로 사용하세요.

---

이 저장소는 개인용 Workout Coach 웹 앱의 v9를 인계받은 프로젝트다. 먼저 코드를 수정하지 말고 다음 파일을 순서대로 전부 읽어라.

1. `README_FIRST.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/KNOWN_ISSUES.md`
4. `docs/REQUIREMENTS_AND_INVARIANTS.md`
5. `docs/REGRESSION_TEST_PLAN.md`
6. `current/workout_coach_unified_v9.html`

첫 번째 응답에서는 다음만 수행하라.

1. 현재 앱의 상태 구조와 이벤트 흐름을 분석한다.
2. 문서에 적힌 확인된 문제를 실제 코드 근거와 대조한다.
3. 문서에 빠진 추가 결함 가능성을 감사한다.
4. 기존 기능 보존 체크리스트를 작성한다.
5. 리팩터링 및 테스트 도입 계획을 작은 단계로 제안한다.
6. 모호해서 사용자 결정이 필요한 항목만 질문한다.

아직 구현하거나 원본 파일을 덮어쓰지 마라.

사용자가 계획을 승인한 뒤에는 다음 원칙을 지켜라.

- Git 기준 커밋을 먼저 만든다.
- 실패를 재현하는 테스트를 구현보다 먼저 추가한다.
- catalog defaults, persistent preferences, current session overrides, completed history를 분리한다.
- 운동 교체를 단일 상태 전이로 구현한다.
- 테스트를 피하기 위해 기존 기능을 삭제하거나 단순화하지 않는다.
- 실제 브라우저 E2E 테스트를 실행한다.
- 모바일 뷰포트를 확인한다.
- v7/v8/v9 데이터 마이그레이션을 fixture로 검사한다.
- 최종 standalone HTML을 생성하되 개발 소스와 테스트를 보존한다.
- 완료라고 보고하기 전에 요구사항 체크리스트, 테스트 결과, 변경 diff, 알려진 미해결 사항을 제시한다.

특히 다음 주장을 테스트 없이 하지 마라.

- “운동 변경 시 모든 설정이 자동 갱신된다.”
- “기존 기능이 유지된다.”
- “저장과 복원이 안전하다.”
- “모바일에서 정상 작동한다.”
- “자가점검이 통과했으므로 완료됐다.”

---

