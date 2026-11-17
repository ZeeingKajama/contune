// 막 7 · 내 보드. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 전부 보드 편집기(#dashedit/bizflow) 한 화면이다. 저장하지 않는다: AI 초안은 받았다가 되돌린다(보드는 처음 그대로, 되풀이해도 같다).
// mock의 AI 초안은 요청 글과 무관하게 '체결 대기 큐' 값과 '시세 지연' 추이를 더한다 → 요청 글을 그 결과와 맞는 한 줄로 둔다.
import { button } from './util.js';

const EDIT = '#dashedit/bizflow';
const ASK = '체결 대기 큐 값과 시세 지연 추이를 더해 줘';

const barBtn = (text) => button('.de-bar button', text);
// 초안 꼬리표(초안 · 검토 뒤 저장 · 위젯 +2 · 바뀜 1 · 되돌리기): 초안을 받은 동안만 보인다
const DRAFT = '.de-bar .de-dr';
const draftOn = (doc) => { const d = doc.querySelector(DRAFT); return !!d && !d.hidden; };
const noDraft = (doc) => !draftOn(doc);
// 남은 초안은 되돌리고 시작한다(초안 위에 초안을 또 받으면 같은 위젯이 거듭 붙는다)
const revert = { click: barBtn('되돌리기'), unless: noDraft };

// AI 초안 창과 요청 글 칸
const AI = '.modal.de-ai';
const ASK_IN = AI + ' textarea.de-ain';
const asked = (doc) => { const t = doc.querySelector(ASK_IN); return !!t && t.value.trim() !== ''; };
// 요청 글을 한 자씩 넣는다(사람이 치는 것처럼 보이게). 이미 같은 글이면 그대로.
const typeAsk = {
  run: async (doc) => {
    const t = doc.querySelector(ASK_IN);
    if (!t) return;
    if (t.value.trim() !== ASK) {
      for (let i = 1; i <= ASK.length && t.isConnected; i++) {
        t.value = ASK.slice(0, i);
        t.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 30));
      }
    }
    t.blur(); // 포커스가 남으면 → · Space가 글자로 들어간다
  },
};

export default {
  id: 'board',
  title: '내 보드',
  stops: [
    {
      id: 'dashedit', title: '보드 편집기',
      say: '관제는 그대로 두고, 내 보드를 그 옆에. 위젯을 누르면 오른쪽에서 고칩니다.',
      point: '오른쪽 폼의 패널 타일: 업무 패널의 타일을 그대로 가져다 쓴다',
      hand: '미리보기의 틀을 끌어 순서를 바꾼다',
      go: EDIT,
      scene: [
        revert,
        { click: '.de-stage section.dw[data-id="rt"]', unless: '.de-stage section.dw.de-sel' },
      ],
      target: '.de-stage section.dw.de-sel',
    },
    {
      id: 'addmenu', title: '위젯 15종',
      say: '지표 넷 · 운영 열 · 글. 업무 흐름도 위젯입니다.',
      go: EDIT,
      scene: [
        revert,
        { click: '.de-bar .de-add', unless: '.de-menu' },
        { wait: '.de-menu' },
      ],
      target: '.de-menu',
    },
    {
      id: 'aidash', title: '문장으로 보드',
      say: '문장 한 줄로 위젯을 더합니다.',
      go: EDIT,
      scene: [revert],
      target: barBtn('AI 초안'),
      press: [
        { click: barBtn('AI 초안'), unless: AI },
        { wait: ASK_IN },
        typeAsk,
      ],
    },
    {
      id: 'aiask', title: '요청 글 한 줄',
      say: '바라는 것을 말로 적고 초안 만들기를 누릅니다.',
      keep: true,
      target: AI,
      dwell: 6000,
      press: [
        { fill: ASK_IN, value: ASK, unless: asked },
        { click: button(AI + ' .btns button', '초안 만들기'), unless: draftOn },
        { wait: draftOn, ms: 12000 },
      ],
    },
    {
      id: 'drafttag', title: '초안 · 검토 뒤 저장',
      say: '위젯 +2 · 바뀜 1. 미리보기로 검토하고, 마음에 안 들면 되돌리기.',
      point: '미리보기 맨 아래 새 위젯 둘 · 제목이 바뀐 RT p99 (AI)',
      keep: true,
      target: DRAFT,
      press: [
        revert,
        { wait: noDraft },
      ],
    },
    {
      id: 'undone', title: '되돌리기',
      say: '초안 전으로 돌아왔습니다. AI는 초안까지, 저장은 사람이 누릅니다.',
      go: EDIT,
      scene: [revert],
      target: '.de-bar .de-save',
    },
  ],
};
