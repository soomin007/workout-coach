# Workout Coach (v10~)

개인용 PT 코칭 웹 앱. 안드로이드 크롬에서 PWA로 쓰는 것이 목표이고, 푸시 알림은 최종 단계의
네이티브 앱(같은 웹 코드를 감싸는 방식)에서 다룬다.

## 세션 시작 루틴

1. `known-issues.md` 확인 (코드 수정 전 필수)
2. `git status` · `git log --oneline -10`
3. 작업 영역 문서만 필요한 절 단위로 읽기:
   - 요구사항 계약: `docs/REQUIREMENTS_AND_INVARIANTS.md`
   - 코칭 수치와 근거: `docs/COACHING_POLICY.md` (조사 원본: `docs/research/`)

## 구조

- `app/`: 배포되는 앱 그대로 (빌드 없음, ES 모듈). `app/js/core/` 는 DOM 을 모르는 순수 로직,
  `app/js/ui/` 는 렌더링과 이벤트만.
- `tests/unit/`: `node --test` (의존성 없음). 코어 로직과 마이그레이션.
- `tests/e2e/`: Playwright. 실제 브라우저 흐름, 모바일 뷰포트.
- `tests/fixtures/`: 합성 fixture 는 커밋. 사용자 실데이터는 `tests/fixtures/private/` (gitignore).
- `current/`: GPT 에서 넘겨받은 v9 원본. 참고용, 수정 금지.

## 배포

- https://soomin007.github.io/workout-coach/ (저장소 soomin007/workout-coach)
- main 에 push 하면 `.github/workflows/pages.yml` 이 단위 테스트 후 `app/` 을 배포한다.
- `app/sw.js` 의 VERSION 은 워크플로가 커밋 해시로 자동 교체한다. 손대지 않는다.
- 서비스 워커에 새 파일을 추가하면 `SHELL` 목록에도 넣는다 (빠지면 오프라인에서 그 파일만 없다).

## 명령

- 단위 테스트: `npm test`
- E2E: `npm run e2e`
- 로컬 서버: `npm run serve` → http://localhost:8080/

## 원칙

- 상태는 네 계층: 카탈로그 기본값 / 사용자 명시 선호(prefs) / 현재 세션 / 완료 기록.
  세션 중 코치가 바꾼 값은 세션에만 저장하고 prefs 에 쓰지 않는다.
- 상태 변경은 `app/js/core/session.js` 의 전이 함수로만 한다. UI 는 전이 후 전체를 다시 그린다.
- 입력 최소화가 최우선 UX 원칙: 앱이 처방을 미리 채우고, 사용자는 다를 때만 고친다.
- 기존 기능 삭제는 사용자 승인 없이 금지 (보존 목록: 요구사항 문서 5절).
