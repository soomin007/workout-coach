// "추천 근거" 화면 내용. 수치 규칙 자체는 docs/COACHING_POLICY.md.
export const EVIDENCE = [
  { label: '저항운동 처방 전반', text: '2026 ACSM overview of reviews를 상위 근거로 사용. 세부 수치는 개인화 정책으로 따로 표시합니다.', source: 'ACSM Position Stand / Overview of Reviews, 2026', url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/' },
  { label: '증량 방식', text: '반복 범위 상단을 채우면 무게를 한 단계 올리는 더블 프로그레션. 연구보다는 코칭 표준에 가깝습니다.', source: 'Stronger By Science, load progression', url: 'https://www.strongerbyscience.com/weekly-load-progression/' },
  { label: 'RIR 자기 추정', text: '사람은 남은 반복을 평균 약 1회 틀리게 추정합니다. 그래서 세트마다 묻지 않고 운동당 한 번 세 단계로 받습니다.', source: 'Halperin et al., 2022 meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/34542869/' },
  { label: '실패 근접도', text: '실패에 가까울수록 근비대가 조금 늘지만 매 세트 실패까지 할 필요는 없습니다. 복합운동은 1~3회 여유를 권합니다.', source: 'Robinson et al., 2024 · Refalo et al., 2023', url: 'https://pubmed.ncbi.nlm.nih.gov/38970765/' },
  { label: '휴식 시간', text: '60초보다 긴 휴식이 약간 유리하고, 90초를 넘기면 차이가 작습니다. 복합운동은 2~3분.', source: 'Singer et al., 2024 · Grgic et al., 2018', url: 'https://pubmed.ncbi.nlm.nih.gov/39205815/' },
  { label: '주간 볼륨', text: '주당 세트가 늘수록 이득이 늘지만 점점 줄어듭니다. 간접 세트는 0.5세트로 셉니다.', source: 'Pelland et al., meta-regression', url: 'https://pubmed.ncbi.nlm.nih.gov/41343037/' },
  { label: '빈도', text: '볼륨이 같다면 빈도 차이는 작아 일정과 회복에 맞춰 나눠도 됩니다.', source: 'Schoenfeld et al., 2019 meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/30558493/' },
  { label: 'Core 구성', text: '허리 이력을 고려해 척추를 굽히는 동작보다 버티는 동작(항신전 · 항회전 · 항측굴)을 우선합니다.', source: 'McGill, Low Back Disorders (빅3)', url: 'https://squatuniversity.com/2018/06/21/the-mcgill-big-3-for-core-stability/' },
];

export const POLICY_NOTE = '논문이 "오늘 Pull +8점" 같은 공식을 주지는 않습니다. 연구는 방향을 정하고, 일정 · 회복 · 기구 · 기록을 합치는 점수와 임계값은 이 앱의 초기 정책값입니다.';
