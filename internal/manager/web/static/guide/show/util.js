// 순서 내용(show/*.js)이 함께 쓰는 도우미. 엔진(guide/stage.js)은 이 파일을 모른다.
export const enc = encodeURIComponent;
// 플로우 상세 주소: flow('대외송수신', 'ext-send-margin', 'gantt')
export const flow = (board, id, tab) => '#board/' + enc(board) + '/' + id + (tab ? '?tab=' + tab : '');
// 확인 창과 그 단추(취소 = 첫째, 확인 = 마지막)
export const CONFIRM = '.modal-bg .modal[role="dialog"]';
export const CONFIRM_OK = CONFIRM + ' .btns button:last-child';
export const noConfirm = (doc) => !doc.querySelector(CONFIRM);
// 지금 어두운 테마인가(테마는 #theme을 눌러 바꾼다: data-theme을 직접 바꾸면 차트가 옛 색으로 남는다)
export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
export const toLight = { click: '#theme', unless: () => !isDark() };
// 순서가 스스로 어둡게 한 테마(막 8의 어두운 테마 · All-in-One 벽면)가 다른 장면으로 새지 않게 하는 한 쌍.
// showDark는 어둡게 바꾸고 표시를 남긴다. undoDark는 표시가 있을 때만 밝게 되돌린다(summit.js가 그 두 장면 밖의 닻 장면마다 맨 앞에 붙인다).
// 발표자가 손으로 고른 어두움은 건드리지 않는다. 벽면에서는 위 막대가 숨어 #theme이 안 보이므로 click 동작 대신 직접 누른다.
let darkByShow = false;
const themeBtn = () => document.getElementById('theme');
export const showDark = { run: () => { if (!isDark() && themeBtn()) { themeBtn().click(); darkByShow = true; } } };
export const undoDark = {
  run: async (doc) => {
    if (!darkByShow) return;
    darkByShow = false;
    if (!isDark() || !themeBtn()) return;
    themeBtn().click();
    // 차트가 있는 화면은 테마를 바꾸면 다시 그려진다(app.js recolor): 그동안은 뒤 동작을 미룬다
    const page = doc.getElementById('page');
    for (let i = 0; i < 60 && page && !page.childElementCount; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 250));
  },
};
// 글자로 요소 찾기: 선택자에 맞는 것 가운데 글에 text(문자열 또는 정규식)가 든 첫 요소
export const byText = (sel, text) => (doc) => {
  const re = text instanceof RegExp ? text : null;
  for (const e of doc.querySelectorAll(sel)) {
    const t = e.textContent || '';
    if (re ? re.test(t) : t.includes(text)) return e;
  }
  return null;
};
// 글자가 꼭 같은 단추
export const button = (sel, text) => (doc) => [...doc.querySelectorAll(sel)].find((b) => b.textContent.trim() === text) || null;
// 오른쪽 서랍
export const drawerOpen = (doc) => !!doc.querySelector('#drawer');
export const closeDrawer = { click: '#drawer > div > button', unless: (doc) => !doc.querySelector('#drawer') };
