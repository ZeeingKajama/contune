// 투어 4: 업무 흐름 보드와 AI 초안. 보드 보기(#dash/bizflow) → 편집 → AI 초안 → 요청 글 → 초안 만들기 → 새 위젯 → 초안 꼬리표.
// 저장하지 않고 끝난다: 초안은 편집기 안의 미리보기일 뿐이라 보드는 그대로다(끝 말에 알린다).
// mock 초안은 무엇을 써도 '체결 대기 큐' 값과 '시세 지연' 추이를 더한다(mock/dash.js llmDraft): 채워 두는 요청 글을 그 답에 맞춘다.
// 요청 칸은 input 이벤트로 값을 읽는다(pages/dashedit.js openAssist): 엔진의 fill이 input을 낸다.
const VIEW = '#dash/bizflow';
const EDIT = '#dashedit/bizflow';

// 보기 화면의 편집 단추(class가 없어 글자로 찾는다. pages/dash.js drawBoard)
function editButton(doc) {
  return [...doc.querySelectorAll('.dv-head .dv-act button')].find((b) => b.textContent === '편집') || null;
}
// 기다리는 동안 가리킬 곳: 만드는 중이면 AI 초안 창, 아직 누르지 않았으면(앞 단계를 건너뜀) 초안 만들기 단추
function draftWait(doc) {
  const b = doc.querySelector('.de-ai .de-save');
  return b && !b.disabled && !b.hidden ? b : doc.querySelector('.modal.de-ai');
}

export default {
  id: 'board',
  title: '업무 흐름 보드와 AI 초안',
  minutes: 2,
  who: '운영자',
  summary: '밀리는 업무를 그림으로 보고 보드를 고칩니다.',
  steps: [
    {
      title: '업무 흐름',
      body: '주문이 채널 → 매매체결 → 시세 → 지수산출 → 분배로 넘어가는 길을 그린 보드입니다. 밀리는 업무의 상자만 색이 바뀌어 어디서 막혔는지 바로 보입니다.',
      terms: [['보드', '필요한 것만 골라 꾸미는 현황판'], ['채널 · 체결 · 시세', '주문을 받고, 거래를 맺고, 그 결과를 시세로 내보내는 업무']],
      go: VIEW,
      target: 'section.dw[data-type="bizflow"]',
      advance: 'next',
    },
    {
      title: 'RT · TAT',
      body: '그림 아래 값은 체결이 얼마나 걸리는지입니다. 표시한 RT와 바로 다음의 TAT가 기준을 넘으면 값 색이 바뀝니다.',
      terms: [['RT', '체결 엔진이 주문을 받아 처리를 끝낼 때까지 걸린 시간'], ['TAT', '주문 접수부터 체결 처리 끝까지 걸린 시간'], ['p99', '100건 중 가장 느린 1건 수준']],
      go: VIEW,
      target: 'section.dw[data-id="rt"]',
      advance: 'next',
    },
    {
      title: '편집',
      body: '보드는 팀이 직접 고쳐 씁니다. 오른쪽 위의 편집을 눌러 보세요.',
      go: VIEW,
      target: editButton,
      advance: 'click',
    },
    {
      title: 'AI 초안',
      body: '위젯을 하나씩 더해도 되지만, 바라는 것을 문장으로 써도 됩니다. 위쪽의 AI 초안을 눌러 보세요.',
      terms: [['위젯', '보드에 놓는 칸 하나. 값, 차트, 목록 같은 것']],
      go: EDIT,
      target: '.de-bar .de-tbtn[aria-haspopup="dialog"]',
      advance: 'click',
    },
    {
      title: '요청 글',
      body: '요청 글은 미리 채워 두었습니다. 평소 말하듯 쓰면 됩니다.',
      terms: [['대기 큐', '처리를 기다리며 쌓인 주문 수'], ['시세 지연', '시세가 만들어져 나가기까지 늦어진 시간']],
      go: EDIT,
      target: 'textarea.de-ain',
      fill: { selector: 'textarea.de-ain', value: '체결 대기 큐 값과 시세 지연 추이를 더해 줘' },
      advance: 'next',
    },
    {
      title: '초안 만들기',
      body: '이 글과 지금 보드 정의를 함께 보내 고친 초안을 받습니다. 초안 만들기를 눌러 보세요.',
      go: EDIT,
      target: '.de-ai .de-save',
      advance: 'click',
    },
    {
      title: '만드는 중',
      body: '초안을 만들고 있습니다. 다 되면 창이 닫히고 넘어갑니다.',
      go: EDIT,
      target: draftWait,
      advance: { appear: '.de-bar .de-dr:not([hidden])' },
      waitHint: '약 2초 걸립니다',
    },
    {
      title: '새 위젯',
      body: '미리보기에 요청한 위젯이 생겼습니다. 체결 대기 큐 값과 시세 지연 차트입니다.',
      go: EDIT,
      target: '.de-stage section.dw[data-id^="queue"]',
      advance: 'next',
    },
    {
      title: '초안 꼬리표',
      body: '초안은 저장 전까지 미리보기일 뿐입니다. 꼬리표에 더한 위젯과 바뀐 수가 적혀 있고, 되돌리기를 누르면 초안 전으로 돌아갑니다.',
      go: EDIT,
      target: '.de-bar .de-dr',
      advance: 'next',
    },
  ],
  done: {
    title: '보드와 AI 초안',
    body: '업무가 어디서 밀리는지 그림으로 보고, 문장으로 보드를 고쳐 봤습니다. 저장하지 않았으니 보드는 그대로입니다. 화면을 옮길 때 나가기를 물으면 나가기를 누르면 됩니다.',
    links: [{ label: '업무 흐름 보드', hash: VIEW }, { label: '매매 현황 보드', hash: '#dash/trading' }],
  },
};
