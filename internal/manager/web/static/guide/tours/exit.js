// 투어 3: 죽은 프로그램의 종료 보고서. 목록 → matching_svc 줄 → 제목(원인 한 줄) → 호출 스택 → 소스 → LLM에 맡기기 → 초안 → 코드 근거.
// 목록 줄에는 id가 없고 순서도 바뀐다: 프로세스 칸 글자로 찾는다(pages/exits.js drawTable). 보고서 id만 고정이다.
// LLM 초안은 mock 세계에 남는다(다시 돌리면 단추가 '다시 맡기기'): 기다리는 단계는 '초안이 있고 단추가 다시 눌리는 때'로 본다.
const CRASH = '#exit/01M6SJCSX8Z20P255E4SX2HSQ9';

// 프로세스 칸(td.proc b)이 matching_svc인 줄. 여럿이면 신호·코드 칸이 SIGSEGV인 것(소스·코드 근거가 붙는 보고서)
function crashRow(doc) {
  const rows = [...doc.querySelectorAll('.exl-tbl tr.click')].filter((r) => (r.querySelector('td.proc b') || {}).textContent === 'matching_svc');
  return rows.find((r) => ((r.querySelector('td.end') || {}).textContent || '').includes('SIGSEGV')) || rows[0] || null;
}
// 맡긴 답이 왔는가: 초안이 그려졌고 단추가 '분석 중…'(disabled)에서 풀렸다(pages/exit.js analyze · drawLLM)
function draftReady(doc) {
  const b = doc.querySelector('#ex-llm .ex-ch button.primary');
  return !!doc.querySelector('#ex-llm .ex-draft') && !!b && !b.disabled;
}
// 기다리는 동안 가리킬 곳: 분석 중이면 LLM 칸, 아직 맡기지 않았으면(앞 단계를 건너뜀) 맡기는 단추
function llmWait(doc) {
  const b = doc.querySelector('#ex-llm .ex-ch button.primary');
  return b && !b.disabled && !doc.querySelector('#ex-llm .ex-draft') ? b : doc.querySelector('#ex-llm');
}

export default {
  id: 'exit',
  title: '죽은 프로그램의 종료 보고서',
  minutes: 2,
  who: '개발자',
  summary: '죽은 까닭을 호출 스택과 소스 줄로 봅니다.',
  steps: [
    {
      title: '종료 보고서 목록',
      body: '프로그램이 비정상으로 끝나면 이음이 보고서를 만들어 이 목록에 모읍니다. 한 줄에 언제, 어느 서버에서, 무슨 까닭으로 끝났는지가 있습니다.',
      terms: [['종료 보고서', '프로그램이 죽은 직접 원인을 한 장에 모은 것']],
      go: '#exits',
      target: '.exl-tbl',
      advance: 'next',
    },
    {
      title: 'matching_svc',
      body: '체결을 맡은 프로그램 matching_svc가 죽은 기록이 있습니다. 그 줄을 눌러 보고서를 열어 보세요.',
      terms: [['체결', '주문을 받아 거래를 맺어 주는 업무']],
      go: '#exits',
      target: crashRow,
      advance: 'click',
    },
    {
      title: '원인 한 줄',
      body: '제목이 곧 원인입니다. 어느 함수에서 어떻게 죽었는지를 이음이 정해진 규칙으로 가려 적었습니다.',
      go: CRASH,
      target: '.ex-head .ex-title',
      advance: 'next',
    },
    {
      title: '호출 스택',
      body: '죽는 순간 함수들이 서로를 부른 순서입니다. 맨 위, 크래시 지점 표시가 붙은 book_insert가 죽은 곳입니다.',
      terms: [['호출 스택', '어떤 함수가 어떤 함수를 불렀는지 쌓인 순서']],
      go: CRASH,
      target: '#ex-ev-core tr.dead',
      advance: 'next',
    },
    {
      title: '소스의 그 줄',
      body: '이음이 저장소에서 그 함수의 코드를 찾아 와 죽은 줄을 칠해 둡니다. 개발자가 코드를 따로 뒤지지 않아도 됩니다.',
      go: CRASH,
      target: '#ex-ev-source .cl.mark.dead',
      advance: 'next',
    },
    {
      title: 'LLM에 맡기기',
      body: '여기까지는 규칙이 가린 사실이고, 같은 근거를 LLM에 보내 풀이를 받아 볼 수도 있습니다. LLM에 맡기기를 눌러 보세요.',
      terms: [['LLM', '글을 읽고 쓰는 AI 모델']],
      go: CRASH,
      target: '#ex-llm .ex-ch button.primary',
      advance: 'click',
    },
    {
      title: '초안 쓰는 중',
      body: 'LLM이 근거 묶음과 코드를 읽고 초안을 씁니다. 초안이 나오면 넘어갑니다.',
      go: CRASH,
      target: llmWait,
      advance: { test: draftReady },
      waitHint: '약 3초 걸립니다',
    },
    {
      title: '참고 초안',
      body: 'LLM이 쓴 풀이와 고칠 방향입니다. 참고용 초안이고, 보고서에 저장되는 원인은 위의 규칙 판단 그대로입니다.',
      go: CRASH,
      target: '#ex-llm .ex-draft',
      advance: 'next',
    },
    {
      title: '코드 근거',
      body: '초안이 짚은 코드 자리입니다. 코드 근거의 파일:줄 단추를 누르면 소스 카드의 그 줄이 칠해집니다.',
      go: CRASH,
      target: '#ex-llm .ex-crefs button.ex-cref',
      advance: 'click',
    },
  ],
  done: {
    title: '죽은 까닭까지',
    body: '신호, 호출 스택, 소스의 죽은 줄이 보고서 한 장에 모였습니다. 저장되는 원인은 규칙 판단이고, LLM 글은 참고 초안입니다.',
    links: [{ label: '종료 보고서 목록', hash: '#exits' }, { label: '실행 이력', hash: '#runs' }],
    next: 'board',
  },
};
