// 막 2 · 원인을 찾아라. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 닻은 첫 장면(관제) 하나, 나머지는 keep: 서랍 → 타임머신으로 이어진다. 타임머신 주소(구간 시각)는 여는 때마다 달라 박지 않고 서랍의 단추로 들어간다.

// 시간대별 배치에서 편 목록이 남아 있으면 접는다(막 1의 장면)
const closePick = { click: '.dtl .tl-pick .tl-x', unless: (doc) => !doc.querySelector('.dtl .tl-pick') };

// 실시간 이벤트에서 체결 대기 큐 알림 줄의 ✦(원인 분석). 첫 줄은 다른 알림이라 글자로 찾는다.
const whyBtn = (doc) => {
  const row = [...doc.querySelectorAll('.dwatch .wl .wrow')].find((r) => /대기 큐/.test(r.textContent));
  return row ? row.querySelector('.wtr') : null;
};
// 그 알림의 추적이 끝까지 간 서랍(다른 알림의 서랍이 아니다)
const traced = (doc) => /대기 큐/.test((doc.querySelector('#drawer .at-steps .ts-line') || {}).textContent || '') && !!doc.querySelector('#drawer table.at-tbl');
const inDrawer = (sel) => (doc) => (traced(doc) ? doc.querySelector('#drawer ' + sel) : null);

// 추적이 고른 A·B 구간으로 연 체결 서비스 타임머신(다른 서비스 화면 · 구간 없이 연 화면이 아니다)
const onTm = () => /^#svc\/matching\?/.test(location.hash) && /[?&]b=\d/.test(location.hash);
const inTm = (sel) => (doc) => (onTm() ? doc.querySelector('.sv-tm ' + sel) : null);
const cmpRow = (leaf) => `.sv-tm .tm-cmp tbody tr[data-leaf="${leaf}"]`;
const tmReady = (doc) => onTm() && !!doc.querySelector('.sv-tm .tm-tracks .tm-track') && !!doc.querySelector('.sv-tm .flame-pair .flame-cell') && !!doc.querySelector(cmpRow('book_insert'));
// 비교 표에서 그 함수를 고른다(이미 골랐으면 그대로: 다시 누르면 풀린다). 표가 그려진 뒤에 본다.
const choose = (leaf) => [
  { wait: tmReady, ms: 10000 },
  { click: cmpRow(leaf), unless: cmpRow(leaf) + '.on' },
  { wait: cmpRow(leaf) + '.on' },
];

export default {
  id: 'trace',
  title: '원인을 찾아라',
  stops: [
    {
      id: 'trace', title: '✦ 원인 분석',
      say: '체결 대기 큐 알림. 왜 쌓였는지 이음이 대신 따라갑니다.',
      point: '실시간 이벤트의 체결 · 대기 큐 줄 끝 ✦',
      go: '#dashboard', exact: true, scene: [closePick],
      target: whyBtn,
      press: [
        { click: whyBtn, unless: traced },
        { wait: traced },
      ],
    },
    {
      id: 'steps', title: '분석 단계',
      say: '알림 → 주인 찾기 → 구간 나누기 → 함수 비교. 뭘 보고 말하는지 그대로 보입니다.',
      keep: true,
      target: inDrawer('ol.at-steps'),
    },
    {
      id: 'fn', title: '원인 후보 함수',
      say: '평소(A)와 알림 구간(B)을 견줬더니 book_insert가 15% → 63%로 가장 늘었습니다.',
      point: '바로 아래 호출 경로 · 같은 시각 주문 유입량 1,500 → 6,000 TPS',
      keep: true,
      target: inDrawer('table.at-tbl'),
    },
    {
      id: 'judge', title: 'AI는 도우미일 뿐',
      say: 'AI 판단은 초안입니다. 같은 근거의 규칙 판단을 아래에 펴 두었습니다.',
      point: '근거 칩 · 권장 조치',
      keep: true,
      scene: [{ wait: traced }, { run: (doc) => { const d = doc.querySelector('#drawer details.aj-rule'); if (d) d.open = true; } }],
      target: inDrawer('section.at-judge'),
    },
    {
      id: 'totm', title: '타임머신으로',
      say: '추적이 고른 A · B 구간 그대로 타임머신을 엽니다. 숫자를 그때 화면으로 확인합니다.',
      keep: true,
      target: inDrawer('.at-act a.ai-btn.primary'),
      press: [
        { click: '#drawer .at-act a.ai-btn.primary', unless: onTm },
        { wait: tmReady, ms: 10000 },
      ],
    },
    {
      id: 'tracks', title: '같은 시간축',
      say: '업무 지표와 CPU가 한 시간축에. 파란 띠 A가 평소(기준 구간), 주황 띠 B가 알림 구간(비교 구간)입니다.',
      hand: 'B 칩을 누르고 차트를 끌면 비교 구간을 다시 고른다',
      keep: true,
      target: (doc) => { const t = inTm('.tm-tracks')(doc); return t ? t.closest('section.tm-card') : null; },
    },
    {
      id: 'flame', title: '플레임 그래프 두 장',
      say: 'CPU를 쓴 함수를 그린 플레임 그래프 두 장. 비교(B)에서 book_insert 칸이 훨씬 넓습니다.',
      hand: '칸을 누르면 그 함수 아래만 크게 본다(한 번 더 누르면 돌아온다)',
      keep: true,
      scene: choose('book_insert'),
      target: inTm('.flame-pair'),
    },
    {
      id: 'verdict', title: '범인은 이 함수',
      say: '가장 늘어난 함수 book_insert, 비중 15% → 63%. 장애를 다시 일으키지 않고도 살펴볼 함수가 나옵니다.',
      point: 'CPU 표본 기준의 후보',
      keep: true,
      scene: choose('book_insert'),
      target: inTm('.tm-verdict'),
    },
    {
      id: 'cmp', title: '함수 골라 보기',
      say: '표의 줄을 누르면 두 그림에서 그 함수가 함께 강조됩니다.',
      point: '둘째 줄 check_risk',
      keep: true,
      scene: choose('book_insert'), // 이전으로 돌아왔을 때도 누르기 전 모습으로
      target: inTm('.tm-cmp table'),
      press: choose('check_risk'),
    },
    {
      // ORDER에 없던 장면: 앞 장면의 누름이 무엇을 바꿨는지 보여 준다(없으면 누르자마자 계보로 올라가 버린다)
      id: 'picked', title: 'check_risk는 줄었다',
      say: '두 그림의 check_risk 칸에 테두리가 생겼습니다. 기준(A) 34.0% → 비교(B) 14.0%.',
      keep: true,
      scene: choose('check_risk'),
      target: inTm('.flame-pair'),
    },
    {
      id: 'lineage', title: '실행 번호가 잇는다',
      say: '이 서비스를 띄운 실행 › 스텝 › 프로세스. 배치와 관제가 한 줄로 이어집니다.',
      point: 'market-open › start-matching 실행 → 스텝 명령 → matching_svc',
      keep: true,
      scene: choose('book_insert'), // 고른 함수를 처음대로
      target: inTm('section.tm-card.sv-lg'),
    },
  ],
};
