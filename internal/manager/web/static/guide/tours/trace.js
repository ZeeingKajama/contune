// 투어 1(추천): 알림에서 원인 함수까지. 관제 AI 브리핑 → 실시간 이벤트 → ✦ 원인 분석 서랍 → 서비스 타임머신(A·B 구간과 함수가 골라진 채로 열린다).
// 실시간 이벤트 줄은 2초마다 새로 만들어지고 줄에 id가 없다(pages/dashboard.js eventList): 줄은 글자로 매번 다시 찾는다.
// 함수까지 이어지는 것은 체결 알림뿐이다. 서버·배치 알림의 ✦(원인 분석)는 '따라갈 곳' 서랍에서 끝난다(ai.js traceView).
// 서비스 타임머신 주소에는 A·B 시각이 들어 있어 미리 알 수 없다: 그 단계들은 go 없이 링크를 눌러 들어간다(돌아갈 주소는 엔진이 기억한다).
const GO = '#dashboard';

// 체결 대기 큐 알림 줄. 없으면 체결 업무 알림, 그것도 없으면 ✦(원인 분석)가 있는 첫 줄
function alertRow(doc) {
  const rows = [...doc.querySelectorAll('.dpanel.dwatch .wrow')].filter((r) => r.querySelector('.wtr'));
  return rows.find((r) => r.textContent.includes('대기 큐'))
    || rows.find((r) => (r.getAttribute('href') || '').startsWith('#biz/matching'))
    || rows[0] || null;
}
function traceButton(doc) {
  const row = alertRow(doc);
  return row ? row.querySelector('.wtr') : null;
}

export default {
  id: 'trace',
  title: '알림에서 원인 함수까지',
  minutes: 2,
  who: '운영자',
  summary: '알림에서 두 번 눌러 원인 후보 함수까지 갑니다.',
  featured: true,
  steps: [
    {
      title: 'AI 상황 브리핑',
      body: '관제 화면 맨 위에서 가장 급한 이슈를 정리합니다. 왼쪽부터 현상(체결 대기 큐 · 응답 시간), 추정 원인(원인 후보 함수), 권장 조치 순으로 읽습니다.',
      terms: [['체결', '주문을 받아 거래를 맺어 주는 업무'], ['추정 원인', 'CPU를 쓴 함수를 평소와 견줘 고른 원인 후보. 단정이 아니다']],
      go: GO,
      target: '.ai-slot .ai-brief',
      advance: 'next',
    },
    {
      title: '실시간 이벤트',
      body: '같은 일이 알림으로도 와 있습니다. 표시한 줄은 체결을 기다리는 주문이 기준보다 많이 쌓였다는 알림입니다.',
      terms: [['대기 큐', '처리를 기다리며 쌓인 주문 수']],
      go: GO,
      target: alertRow,
      advance: 'next',
    },
    {
      title: '✦ 원인 분석',
      body: '왜 쌓였는지 이음이 대신 따라가 봅니다. 줄 끝의 ✦(원인 분석)를 눌러 보세요.',
      go: GO,
      target: traceButton,
      advance: 'click',
    },
    {
      title: '원인 분석',
      body: '이음이 따라간 순서가 번호로 적혀 있습니다. 평소(A)와 알림 구간(B)에 CPU를 쓴 함수를 견준 표에서 book_insert가 가장 크게 늘었습니다.',
      terms: [['A·B 구간', 'A는 평소, B는 알림이 난 구간'], ['Self 비중', '그 함수 자신이 쓴 CPU 몫']],
      go: GO,
      target: '#drawer .at-tbl',
      advance: 'next',
      side: 'left',
    },
    {
      title: '타임머신으로',
      body: '표의 숫자를 그때 화면으로 직접 확인합니다. 서랍 맨 아래의 타임머신에서 A·B 비교 열기 →를 눌러 보세요.',
      terms: [['타임머신', '지나간 구간의 업무 지표·CPU·함수 기록을 다시 펼쳐 보는 화면']],
      go: GO,
      target: '#drawer .at-act a.ai-btn.primary',
      advance: 'click',
      side: 'left',
    },
    {
      title: '같은 시간축',
      body: '체결 서비스의 타임머신입니다. 업무 지표와 CPU가 같은 시간축에 놓여 있고, 파란 띠가 평소(A), 주황 띠가 알림 구간(B)입니다.',
      terms: [['서비스', '장이 열린 동안 계속 떠 있는 프로그램'], ['RT · TAT', '주문 한 건을 처리하는 데 걸린 시간']],
      target: '.sv-tm .tm-tracks',
      advance: 'next',
      side: 'left', // 알림 구간(B) 띠가 오른쪽 끝에 있다: 카드가 가리지 않게
    },
    {
      title: '플레임 그래프 두 장',
      body: '두 구간에 CPU를 쓴 함수를 그린 그림입니다. 기준(A)보다 비교(B)에서 테두리로 표시된 book_insert 칸이 훨씬 넓습니다.',
      terms: [['플레임 그래프', '위가 바깥 함수, 아래가 안쪽 함수. 칸 너비는 CPU를 쓴 비율']],
      target: '.sv-tm .flame-pair',
      advance: 'next',
    },
    {
      title: '원인 후보 함수',
      body: '가장 늘어난 함수가 한 줄 결론으로 나옵니다. 장애를 다시 일으켜 보지 않고도 살펴볼 곳이 나온 셈입니다. CPU를 쓴 곳만 본 것이라 단정이 아닌 후보입니다.',
      target: '.sv-tm .tm-verdict',
      advance: 'next',
    },
  ],
  done: {
    title: '알림에서 함수까지',
    body: '지금은 업무 관제 → 운영 담당 → 서버 관제 → 스케줄러 → 개발자 재현, 도구 여러 개를 오가는 5단계입니다. 이음에서는 알림에서 두 번 눌러 원인 후보 함수까지 왔습니다.',
    links: [{ label: '장애 위험도', hash: '#risk' }, { label: '서비스 목록', hash: '#svcs' }],
    next: 'batch',
  },
};
