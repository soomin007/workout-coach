# 요구사항과 불변조건

이 문서는 새 구현이 반드시 지켜야 할 계약이다. 모호한 경우 임의로 기능을 삭제하거나 축소하지 말고 먼저 질문한다.

## 0. 최우선 원칙: 실시간 입력 최소화 (2026-09-26 사용자 결정)

사용자의 가장 큰 고충은 운동 중 실시간 입력의 번거로움이다.

- 앱이 모든 본세트를 처방 중량 · 목표 반복으로 미리 채운다. 계획대로면 ✓ 한 번.
- 다를 때만 −/+ 로 고친다. 세트 기록에 키보드를 요구하지 않는다.
- RIR 은 운동당 한 번, 3단계 느낌 버튼으로 받는다. 세트별 RIR 입력은 선택 기능으로 남긴다.
- 실제 휴식은 ✓ 시각 간격으로 자동 기록한다.
- 운동 후 몰아서 고치는 흐름(계획표에서 틀린 숫자만 수정, 한 줄 메모 입력)을 지원한다.
- `prompt()` / `confirm()` 기반 입력을 앱 내 시트로 대체한다.
- 세부 수치는 `docs/COACHING_POLICY.md`.

## 0-1. 인수인계 이후 확정된 결정

- 세션 중 자동 휴식 연장, 휴식 ±버튼은 세션 한정. 기본 휴식은 설정에서만 바꾼다.
- 기록 개수 상한(이력 160, 운동기록 900)을 없앤다.
- v7 의 영구 "기구 없음"(`unavailable`)을 복원한다 (v9 에서 소실된 기능).
- 운동 순서를 자유롭게 바꾸는 기능을 추가한다 (v7 실데이터 메모의 요구).
- Core 세션은 3종목 구성 (정책 문서 8절).
- 배포: GitHub Pages PWA. 푸시 알림은 최종 단계 네이티브 앱에서.

## 1. 상태 계층

### 운동 카탈로그 기본값

운동의 정적 정의다.

- id, name, role, muscles, equipment
- default sets, rep range, rest, increment, load mode
- unilateral, compound, cue, why

### 영구 사용자 선호

사용자가 명시적으로 바꾼 운동별 기본값만 저장한다.

- load mode
- increment
- default rest
- 필요하면 rep range 및 unilateral 설정

자동 코칭에 따른 세션 한정 조정은 여기에 저장하지 않는다.

### 현재 세션 상태

- 운동 순서와 슬롯
- 오늘의 세트 수
- 오늘의 휴식 조정
- 입력한 중량, 횟수, RIR
- 완료 여부
- 워밍업 수준
- 메모
- 진행 중 타이머

### 완료 기록

세션 완료 시 확정된 데이터다. 이후 현재 세션 변경이 과거 기록을 수정하면 안 된다.

## 2. 운동 교체 불변조건

운동 A를 B로 완전히 교체하면 다음 값은 B 또는 B의 영구 사용자 선호에서 다시 계산한다.

- exerciseId, name, variant
- role 및 필요 시 slot
- primary/secondary muscles
- equipment
- loadMode
- increment
- range
- rest
- unilateral
- compound
- cue, why
- set count
- warmup level
- previous-performance lookup
- recommendation and suggested first-set load
- UI badge, metadata, input layout, placeholders
- estimated session time

기존 운동에서 무조건 계승해서는 안 되는 값:

- set count
- warmup level
- load mode
- increment
- rest
- unilateral input structure
- suggested load

### 미입력·미완료 운동 교체

- 기존 운동을 새 운동으로 완전히 교체한다.
- 새 운동 프로필 전체를 적용한다.

### 미완료 입력이 있는 운동 교체

- 사용자 확인 없이 데이터를 버리지 않는다.
- 취소하면 어떤 상태도 변경하지 않는다. custom exercise나 preference도 남기지 않는다.

### 일부 세트가 완료된 운동 교체

- 완료 세트는 기존 운동 기록으로 유지한다.
- 남은 세트는 새 운동으로 명시적으로 분리한다.
- 새 운동의 중량 방식과 입력 구조를 사용한다.
- 남은 세트 개수 정책은 테스트로 고정하고 UI에서 설명한다.

### 모든 세트가 완료된 운동

- 완료 기록을 다른 운동명으로 덮어쓰지 않는다.
- 기구 사용 불가 표시는 이후 후보 선택에만 반영한다.

## 3. 렌더링 불변조건

- 사용자에게 보이는 운동 카드 전체는 현재 상태의 결과여야 한다.
- `loadMode`, `unilateral`, `rest`, `range`, `exerciseId` 변경 후 의존 UI를 즉시 갱신한다.
- DOM만 바꾸고 상태를 바꾸지 않거나, 상태만 바꾸고 DOM을 방치하지 않는다.
- 렌더링 때문에 사용자가 입력 중인 값이나 포커스가 불필요하게 사라지지 않도록 한다.

## 4. 저장 불변조건

- 중요한 상태 변경은 새로고침 뒤에도 복원되어야 한다.
- localStorage와 IndexedDB 중 어떤 데이터가 최신인지 명시적인 revision 또는 timestamp로 판단한다.
- 저장 실패는 사용자에게 명확히 알린다.
- JSON 내보내기와 재가져오기는 무손실이어야 한다.
- 이전 버전 가져오기는 실제 fixture로 테스트한다.

## 5. 기존 기능 보존 목록

- 자동 및 수동 부위 선택
- DOMS, 통증, 에너지, 시간, 강도 반영
- 장비 설정과 PT 일정
- Push/Pull/Lower/Core 운동 DB
- 핵심 슬롯 보장 및 자동 보완
- 중복 운동 방지
- 운동 추가·삭제·순서 변경
- 기구 사용 불가와 운동 교체
- 사용자 직접 운동 생성
- 세트 유형: 워밍업, 본세트, 백오프
- 일반 및 편측 세트 기록
- 중량 방식 6종: total, per_side, per_dumbbell, machine, bodyweight, assist
- 운동별 증량 단위와 기본 휴식 사용자 설정
- 세션 및 휴식 타이머
- 실제 휴식 기록
- 최근 기록과 중량 제안
- RIR 기반 세트 코칭
- 세션 메모 및 운동 메모
- 주간 작업세트와 근육별 유효세트
- PT 기록 및 최근 이력 수정
- JSON, CSV, TXT, 인쇄/PDF
- JSON 복원
- v7/v8/v9 데이터 호환
- 모바일 사용성

## 6. 변경 정책

- 기존 기능 삭제는 사용자의 명시적 승인 없이는 금지한다.
- 기능 의미가 바뀌면 migration 또는 명확한 안내가 필요하다.
- 큰 재작성은 기준 동작 테스트를 먼저 만든 후 진행한다.
- 최종 standalone HTML 생성 전에 개발 소스 테스트를 모두 통과시킨다.

