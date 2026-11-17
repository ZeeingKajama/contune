// 투어 2: 실패한 배치 다시 돌리기. 배치판 카드 → ext-send-margin 줄 → 그래프 → 실패한 스텝 → 서랍 → 재실행 → 확인 창 → 성공까지 → 감사 기록.
// 카드·줄에는 id가 없어 글자로 찾는다(pages/batch.js drawCards·drawTable). 그래프·서랍은 2초, 목록은 5초마다 새로 그려진다.
// 재실행 확인 창에는 사유 칸이 없다(사유는 강제 OK만 묻는다. pages/batch.js drawDrawer).
// 다시 돌려 볼 수 있게 상태(.has-fail · .st-failed)가 아니라 이름으로 찾는다: 한 번 성공시킨 뒤에도 같은 길을 간다.
const enc = encodeURIComponent;
const BOARD = '#board/' + enc('대외송수신');
const FLOW = BOARD + '/ext-send-margin';

// 배치판 카드: 이름 칸(.tl)이 대외송수신인 것
function boardCard(doc) {
  return [...doc.querySelectorAll('.bt-cards .bt-tcard')].find((c) => (c.querySelector('.tl') || {}).textContent === '대외송수신') || null;
}
// 플로우 줄: 이름(.bt-name b)이 ext-send-margin인 것
function flowRow(doc) {
  const b = [...doc.querySelectorAll('.bt-tablebox tr.click .bt-name b')].find((x) => x.textContent === 'ext-send-margin');
  return b ? b.closest('tr') : null;
}
// 서랍이 열려 있으면 닫는 ✕, 닫혔으면 위 막대의 감사 기록(서랍 배경이 위 막대까지 덮어, 닫아야 눌린다. style.css #drawer-bg)
function auditWay(doc) {
  return doc.querySelector('#drawer > div > button') || doc.querySelector('#user a.audit-link');
}
// 재실행이 끝났는가: 다시 도는 모습(성공이 아닌 상태)을 한 번 본 뒤에 제목 옆 플로우 상태가 성공이 된 때.
// 이미 성공한 플로우를 다시 돌릴 때(투어를 두 번째 도는 때)는 누른 직후에도 화면이 아직 '성공'이라, 그것만 보면 바로 넘어가 버린다.
let rerunSeen = false;
function rerunDone(doc) {
  const ok = (e) => !!e && e.classList.contains('succeeded');
  const flow = doc.querySelector('.bt-titlerow .bt-tstate .badge');
  const run = doc.querySelector('#drawer .dw-state .badge'); // 서랍은 새 시도로 바뀐다(대기 → 실행 중 → 성공)
  if ((flow && !ok(flow)) || (run && !ok(run))) { rerunSeen = true; return false; }
  if (!rerunSeen || !ok(flow)) return false;
  rerunSeen = false;
  return true;
}
// 감사 기록에서 가장 최근의 재실행 줄(행동 칸 title이 run.rerun. auditfmt.js actionCell). 없으면 맨 위 줄
function rerunRow(doc) {
  const rows = [...doc.querySelectorAll('table.au-tbl tbody tr.click')];
  return rows.find((r) => r.querySelector('.au-act[title="run.rerun"]')) || rows[0] || null;
}

export default {
  id: 'batch',
  title: '실패한 배치 다시 돌리기',
  minutes: 2,
  who: '운영자',
  summary: '실패한 스텝을 다시 돌리고 기록을 확인합니다.',
  steps: [
    {
      title: '배치판',
      body: '배치는 정해진 시각에 차례로 도는 작업이고, 카드 하나가 배치판입니다. 빨간 글씨로 실패가 보이는 대외송수신 카드를 눌러 보세요.',
      terms: [['배치판', '플로우를 묶는 폴더'], ['플로우', '순서와 재시도가 정해진 작업 묶음']],
      go: '#board/',
      target: boardCard,
      advance: 'click',
    },
    {
      title: '실패한 플로우',
      body: '한 줄이 플로우 하나이고, 띠는 최근 10회의 결과입니다. 상태가 실패인 ext-send-margin 줄을 눌러 보세요.',
      go: BOARD,
      target: flowRow,
      advance: 'click',
    },
    {
      title: '그래프',
      body: '네모 하나가 스텝이고 왼쪽에서 오른쪽으로 차례로 돕니다. 빨간 네모가 실패한 스텝이고, 그 뒤 스텝은 기다리고 있습니다.',
      terms: [['스텝', '플로우 안의 작업 한 칸']],
      go: FLOW,
      target: '.bt-graph .fg-canvas',
      advance: 'next',
    },
    {
      title: '실패한 스텝',
      body: '빨간 네모 send-margin을 눌러 보세요. 그 스텝이 돈 기록이 오른쪽에 열립니다.',
      go: FLOW,
      target: '.bt-graph .fg-node[data-step="send-margin"]',
      advance: 'click',
    },
    {
      title: '실패한 까닭',
      body: '이음이 정해진 대로 다시 시도했지만 세 번 모두 실패했습니다. 아래 로그의 (E) 줄에 그 까닭이 남아 있습니다.',
      terms: [['(E) 줄', '로그에서 오류를 뜻하는 줄']],
      go: FLOW,
      target: '#drawer .bt-log',
      advance: 'next',
      side: 'left',
    },
    {
      title: '재실행',
      body: '상대 쪽 문제가 풀렸다고 하고 이 스텝만 다시 돌려 봅니다. 조작 칸의 재실행을 눌러 보세요.',
      go: FLOW,
      target: '#drawer .bt-actions button:nth-child(2)',
      advance: 'click',
      side: 'left',
    },
    {
      title: '확인 창',
      body: '실행을 바꾸는 조작은 한 번 더 묻습니다. 확인 창의 재실행 단추를 눌러 보세요.',
      go: FLOW,
      target: '.modal-bg .modal[role="dialog"] .btns button:last-child',
      advance: 'click',
    },
    {
      title: '다시 도는 중',
      body: '새 시도가 돌고 있습니다. send-margin이 성공하면 기다리던 뒤 스텝이 이어서 돌고, 제목 옆 상태가 성공으로 바뀝니다.',
      go: FLOW,
      target: '.bt-graph .fg-canvas',
      advance: { test: rerunDone },
      waitHint: '성공으로 바뀔 때까지 15~20초쯤 걸립니다',
      side: 'left',
    },
    {
      title: '감사 기록',
      body: '방금 한 조작은 기록으로 남습니다. 서랍을 ✕로 닫고, 위 막대 오른쪽의 감사 기록을 눌러 보세요.',
      go: FLOW,
      target: auditWay,
      advance: { hash: /^#audit/ },
      waitHint: '감사 기록 화면이 열리면 넘어갑니다',
      side: 'left',
    },
    {
      title: '방금 한 재실행',
      body: '표시한 줄이 방금 한 재실행입니다. 누가, 언제, 무엇을 했는지 남아 있어 나중에 되짚을 수 있습니다.',
      go: '#audit',
      target: rerunRow,
      advance: 'next',
    },
  ],
  done: {
    title: '실패 처리 끝',
    body: '실패한 스텝을 찾아 다시 돌리고, 그 조작이 기록에 남는 것까지 봤습니다. 여러 스텝이 나란히 돌다 합쳐지고, 실패하면 스스로 다시 시도하는 예는 개장준비 › market-open에 있습니다.',
    links: [{ label: '개장준비 › market-open', hash: '#board/' + enc('개장준비') + '/market-open' }, { label: '실행 이력', hash: '#runs' }],
    next: 'exit',
  },
};
