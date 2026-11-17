// 막 4 · 배치. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 한 번뿐인 조작(재실행 · 강제 OK · 강제 종료)은 이미 한 뒤 다시 들어와도 "된 상태"를 보여 주게 unless를 건다.
// 실행 id는 여는 날마다 달라 박지 않는다: 그래프의 스텝이나 표의 줄을 눌러 들어간다.
import { flow, CONFIRM, CONFIRM_OK, noConfirm, closeDrawer } from './util.js';

const MARKET = flow('개장준비', 'market-open');
const EXT = flow('대외송수신', 'ext-send-margin');
const SETTLE = flow('정산', 'daily-settle');
const RISK = flow('장중', 'intraday-risk');

// ---- 플로우 상세(pages/batch.js) ----
const node = (id) => `.bt-graph .fg-node[data-step="${id}"]`;
const CANVAS = '.bt-graph .fg-canvas';
const nodeText = (doc, id) => (doc.querySelector(node(id)) || {}).textContent || '';
// 그 스텝이 있는 플로우 화면인가. keep 장면의 target은 다른 플로우 화면에서 보이면 안 된다(건너뛰어 왔을 때 되감기지 않는다)
const has = (doc, id) => !!doc.querySelector(node(id));
// 탭(그래프 · 간트): 같은 플로우 화면에 다시 들어오면 화면을 다시 그리지 않아 탭이 남는다 → scene으로 맞춘다
const tabBtn = (label) => (doc) => [...doc.querySelectorAll('.bt-tabs button')].find((b) => b.textContent.trim().startsWith(label)) || null;
const graphTab = [{ click: tabBtn('그래프'), unless: '.bt-graph' }, { wait: '.bt-graph .fg-node' }];
// 플로우 실행 고르기: ok(doc)가 참이 되는 실행을 최근 것부터 찾는다(못 찾으면 그대로 둔다). 지금 실행을 누른 뒤에도 재시도가 있는 스케줄 실행을 보여 주려고.
const pickRun = (ok) => ({ run: (doc) => {
  const p = doc.querySelector('select.bt-picker');
  if (!p || ok(doc)) return;
  const was = p.value;
  const set = (v) => { p.value = v; p.dispatchEvent(new Event('change', { bubbles: true })); };
  for (const v of [...p.options].map((o) => o.value)) { set(v); if (ok(doc)) return; }
  set(was);
} });
// 최근 실행으로
const latestRun = { run: (doc) => {
  const p = doc.querySelector('select.bt-picker');
  if (p && p.value !== '') { p.value = ''; p.dispatchEvent(new Event('change', { bubbles: true })); }
} };
const runInfo = (doc) => (doc.querySelector('.bt-runinfo') || {}).textContent || '';
const flowRunning = (doc) => /실행 중/.test((doc.querySelector('.bt-tstate') || {}).textContent || '');
// 최근 실행이 방금(3분 안에) 누른 수동 실행인가: 이전 · 되감기로 다시 와도 실행을 또 만들지 않는다
const justRan = (doc) => {
  if (!/^수동/.test(runInfo(doc))) return false;
  const o = doc.querySelector('select.bt-picker option');
  const m = o && /(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(o.textContent);
  if (!m) return false;
  const now = new Date();
  return Math.abs(now - new Date(now.getFullYear(), m[1] - 1, +m[2], +m[3], +m[4], +m[5])) < 180000;
};
// 지금 실행을 누르지 않을 때: 이미 실행 중(중복 실행은 409 "이전 실행이 진행 중")이거나 방금 돌렸다
const noRun = (doc) => flowRunning(doc) || justRan(doc);

// ---- 스텝 서랍 ----
const ACTS = '#drawer .bt-actions';
const actBtn = (text) => (doc) => [...doc.querySelectorAll(ACTS + ' button')].find((b) => b.textContent.trim() === text) || null;
const locked = (text) => (doc) => { const b = actBtn(text)(doc); return !b || b.disabled; };
const hasConfirm = (doc) => !!doc.querySelector(CONFIRM);
// 그래프의 스텝을 눌러 서랍을 연다(이미 열려 있으면 그대로)
const openStep = (id) => [{ click: node(id), unless: ACTS }, { wait: ACTS }];
// 확인 창에서 확인(창이 없으면 건너뛴다)
const confirmOk = [{ sleep: 500 }, { click: CONFIRM_OK, unless: noConfirm }, { gone: '.modal-bg' }];

// 실패한 send-margin: 재실행한 뒤에는 실패가 아니다
const sendFailed = (doc) => !!doc.querySelector(node('send-margin') + '.st-failed');
// 서랍의 시도 단추 가운데 마지막 실패(재실행 뒤에도 실패 로그를 보여 주려고)
const lastFailedTry = (doc) => { const a = doc.querySelectorAll('#drawer .dw-try.s-failed'); return a[a.length - 1] || null; };
// 보류였던 settle
const settleHeld = (doc) => !!doc.querySelector(node('settle') + '.st-held');

// ---- 실행 타임머신(pages/tm.js) ----
const tmTab = (label) => (doc) => [...doc.querySelectorAll('.tm-tabs button')].find((b) => b.textContent.trim().startsWith(label)) || null;
const gateRow = (doc) => [...doc.querySelectorAll('.tm-evs li')].find((li) => /게이트 불충족/.test(li.textContent)) || null;

// ---- 플로우 편집기(pages/editor.js) ----
const edBtn = (text) => (doc) => [...doc.querySelectorAll('.ed-bar button')].find((b) => b.textContent.trim() === text) || null;
const YAML = '.ed-side pre.ed-yaml';
const DRAFT = '.ed-bar .ed-draft'; // 초안을 받기 전에는 숨어 있다
const drafted = (doc) => { const e = doc.querySelector(DRAFT); return !!e && !e.hidden; };
const edTitle = (doc) => ((doc.querySelector('.ed-bar .ed-title') || {}).textContent || '').trim();
// mock의 AI 초안은 요청 글과 무관한 고정 초안이다(settle-load-dw, 2스텝). 요청 글을 그 결과와 맞춘다.
const ASK = '매일 18시에 batch-01에서 정산 리포트를 만들고 끝나면 dw-01에 적재';

// ---- 실행 이력(pages/runs.js) ----
// BATCH_JOB › start 가운데 프로세스 셋을 띄운 실행의 줄
const jobRow = (doc) => [...doc.querySelectorAll('.rn-tbl tbody tr')].find((r) => r.querySelectorAll('.rn-pc').length >= 3) || null;

export default {
  id: 'batch',
  title: '배치',
  stops: [
    {
      id: 'boards', title: '배치판',
      say: '플로우 41개를 배치판 여섯에 나눠 봅니다. 대외송수신에 실패 하나가 보입니다.',
      point: '붉은 줄이 그어진 대외송수신 카드',
      go: '#board/', target: '.bt-cards',
    },
    {
      id: 'graph', title: '플로우 그래프',
      say: '갈래 · 합류 · 서버 간 의존이 한 그림에. load-equity는 시도 2에서 성공했습니다.',
      point: '주황 점선이 서버 간 의존(batch-01 → match-01)',
      go: MARKET, scene: [...graphTab, { wait: 'select.bt-picker' }, pickRun((doc) => /시도 2/.test(nodeText(doc, 'load-equity')))],
      target: CANVAS,
    },
    {
      id: 'gantt', title: '간트',
      say: '스텝별 소요 시간과 대기. load-equity의 실패와 재시도 사이 간격까지 보입니다.',
      point: 'load-equity 줄의 붉은 막대와 초록 막대',
      go: MARKET,
      scene: [{ click: tabBtn('간트'), unless: '.bt-gantt' }, { wait: '.bt-gantt .gt-bar' }, pickRun((doc) => !!doc.querySelector('.bt-gantt .gt-bar.s-failed'))],
      target: '.bt-gantt',
    },
    {
      id: 'runnow', title: '지금 실행',
      say: '스케줄과 별개로 지금 한 번 돌립니다.',
      go: MARKET, scene: [...graphTab, { wait: 'select.bt-picker' }, latestRun],
      target: '.bt-titlerow button.primary',
      // 발표자가 단추를 직접 눌렀는데 누르지 않을 때면 확인 창은 취소한다
      press: [
        { click: '.bt-titlerow button.primary', unless: (doc) => noRun(doc) || hasConfirm(doc) },
        { wait: CONFIRM, unless: noRun },
        { click: CONFIRM + ' .btns button:first-child', unless: (doc) => noConfirm(doc) || !noRun(doc) },
        ...confirmOk,
        { wait: (doc) => /^수동/.test(runInfo(doc)), ms: 6000, unless: flowRunning },
      ],
    },
    {
      id: 'running', title: '차례로 초록',
      say: '다섯 스텝이 선후행대로 돕니다. 두 갈래는 함께 돌고, 화면은 2초마다 갱신됩니다.',
      keep: true, dwell: 28000,
      // 최근 실행이 수동 실행이거나 지금 도는 중일 때만
      target: (doc) => (has(doc, 'check-ready') && (/^수동/.test(runInfo(doc)) || flowRunning(doc)) ? doc.querySelector(CANVAS) : null),
    },
    {
      id: 'failed', title: '실패한 배치',
      say: 'send-margin이 세 번 시도하고 실패. 뒤 스텝은 선행 실패로 대기 중입니다.',
      point: '실패한 스텝을 누르면 서랍이 열린다',
      go: EXT, scene: [...graphTab],
      target: node('send-margin'),
      press: [...openStep('send-margin'), { wait: '#drawer pre.bt-log' }],
    },
    {
      id: 'log', title: '왜 실패했나',
      say: '로그 마지막 줄: 상대 서버 연결 실패. 타임머신에서 분석 링크도 이 서랍에 있습니다.',
      keep: true,
      scene: [{ click: lastFailedTry, unless: (doc) => { const b = lastFailedTry(doc); return !b || b.classList.contains('on'); } },
        { wait: (doc) => /연결 실패/.test((doc.querySelector('#drawer pre.bt-log') || {}).textContent || '') }],
      target: (doc) => (has(doc, 'send-margin') ? doc.querySelector('#drawer pre.bt-log') : null),
    },
    {
      id: 'rerun', title: '재실행',
      say: '상대 서버가 살아났다고 치고 다시 돌립니다.',
      keep: true, target: (doc) => (has(doc, 'send-margin') ? actBtn('재실행')(doc) : null),
      // 이미 다시 돌린 뒤(스텝이 실패가 아님)에는 누르지 않는다
      press: [
        { click: actBtn('재실행'), unless: (doc) => !sendFailed(doc) || locked('재실행')(doc) || hasConfirm(doc) },
        { wait: CONFIRM, unless: (doc) => !sendFailed(doc) || locked('재실행')(doc) },
        ...confirmOk,
      ],
    },
    {
      id: 'resume', title: '뒤 스텝이 이어 돈다',
      say: '시도 4가 성공하면 막혔던 confirm-send가 스스로 돕니다.',
      keep: true, dwell: 20000,
      scene: [closeDrawer, { wait: (doc) => !sendFailed(doc), ms: 12000 }],
      target: (doc) => (has(doc, 'confirm-send') && !sendFailed(doc) ? doc.querySelector(CANVAS) : null),
    },
    {
      id: 'held', title: '보류',
      say: '체결 대기 큐가 밀려 있어 정산 스텝 settle이 보류입니다. 까닭은 타임머신에서 봅니다.',
      go: SETTLE, scene: [...graphTab],
      target: node('settle'),
      press: [
        ...openStep('settle'), { sleep: 600 },
        { click: '#drawer a.bt-btn.primary' },
        { wait: '.tm-tabs' },
        { click: tmTab('상태 변경 이력'), unless: gateRow },
        { wait: gateRow },
      ],
    },
    {
      id: 'heldwhy', title: '보류 까닭',
      say: '게이트 불충족: match-01의 대기 큐가 1020, 기준은 500. 큐가 줄면 스스로 돕니다.',
      point: '상태 변경 이력의 대기 → 보류 줄',
      keep: true, target: gateRow,
    },
    {
      id: 'forceok', title: '강제 OK',
      say: '급하면 사유를 적고 강제 OK. 사유는 감사 기록에 남습니다.',
      go: SETTLE, scene: [...graphTab, ...openStep('settle')],
      target: actBtn('강제 OK'),
      // 이미 넘긴 뒤(단추가 잠김)에는 누르지 않는다
      press: [
        { click: actBtn('강제 OK'), unless: (doc) => locked('강제 OK')(doc) || hasConfirm(doc) },
        { wait: CONFIRM, unless: locked('강제 OK') },
        { fill: CONFIRM + ' input[type="text"]', value: '체결 대기 큐 확인 · 정산 먼저 진행', unless: noConfirm },
        { sleep: 700 },
        ...confirmOk,
      ],
    },
    {
      id: 'released', title: '뒤 스텝이 돈다',
      say: 'settle은 성공 · 강제 OK로 넘어가고, 기다리던 settle-report가 이어 돕니다.',
      keep: true, dwell: 13000,
      scene: [closeDrawer, { wait: (doc) => /성공|실행 중/.test(nodeText(doc, 'settle-report')), ms: 20000 }],
      target: (doc) => (has(doc, 'settle-report') && !settleHeld(doc) ? doc.querySelector(CANVAS) : null),
    },
    {
      id: 'kill', title: '끝나지 않는 스텝',
      say: 'post-risk가 끝나지 않고 돌고 있습니다. 서랍의 강제 종료로 끝냅니다.',
      go: RISK, scene: [...graphTab, ...openStep('post-risk')],
      target: actBtn('강제 종료'),
      // 이미 끝낸 뒤(단추가 잠김)에는 누르지 않는다
      press: [
        { click: actBtn('강제 종료'), unless: (doc) => locked('강제 종료')(doc) || hasConfirm(doc) },
        { wait: CONFIRM, unless: locked('강제 종료') },
        ...confirmOk,
        { wait: (doc) => /강제 종료됨/.test((doc.querySelector('#drawer pre.bt-log') || {}).textContent || ''), ms: 6000 },
      ],
    },
    {
      id: 'killed', title: '강제 종료',
      say: '종료 코드 137, 로그 끝에 강제 종료됨. 누가 · 언제 끝냈는지는 감사 기록에 남습니다.',
      keep: true,
      target: (doc) => { const p = doc.querySelector('#drawer pre.bt-log'); return p && has(doc, 'post-risk') && /강제 종료됨/.test(p.textContent) ? p : null; },
    },
    {
      id: 'editor', title: '그림으로 고친다',
      say: 'YAML을 손으로 쓰지 않고 그림으로 고칩니다. 고칠 때마다 검증이 돕니다.',
      point: '위 막대의 검증 통과',
      hand: '스텝 추가의 카드를 캔버스로 끌어다 놓고, 노드 오른쪽 점을 끌어서 연결한다',
      go: '#edit/market-open',
      scene: [{ wait: '.ed-stage .ed-node' }, { click: edBtn('코드'), unless: (doc) => !doc.querySelector(YAML) }],
      target: '.ed-stage',
    },
    {
      id: 'yaml', title: '파일이 기준',
      say: '저장하면 이 YAML 파일로 기록됩니다. 기준은 파일이라 버전 관리가 그대로 됩니다.',
      keep: true, scene: [{ click: edBtn('코드'), unless: YAML }],
      target: (doc) => (edTitle(doc) === 'market-open' ? doc.querySelector(YAML) : null),
    },
    {
      id: 'aiflow', title: '문장으로 플로우',
      say: '문장 한 줄이 스텝과 스케줄 초안이 됩니다.',
      go: '#edit/new?board=' + encodeURIComponent('정산'),
      scene: [{ wait: edBtn('AI 초안') }],
      target: edBtn('AI 초안'),
      // 이미 초안을 받았으면(꼬리표가 보임) 다시 만들지 않는다
      press: [
        { click: edBtn('AI 초안'), unless: (doc) => drafted(doc) || !!doc.querySelector('.ed-modal') },
        { wait: 'textarea.ed-nl', unless: drafted },
        { fill: 'textarea.ed-nl', value: ASK, unless: drafted },
        { sleep: 1200 },
        { click: '.ed-modal .btns button.ed-save', unless: drafted },
        { wait: drafted },
      ],
    },
    {
      id: 'aiflowed', title: '초안 · 검토 후 저장',
      say: '스텝 둘과 매일 18:00 스케줄이 채워졌습니다. AI는 초안까지, 검증을 통과해야 저장됩니다.',
      point: '위 막대의 AI 초안 · 검토 후 저장',
      keep: true,
      target: (doc) => (drafted(doc) && edTitle(doc).startsWith('새 플로우') ? doc.querySelector('.ed-stage') : null),
    },
    {
      id: 'runs', title: '실행 이력',
      say: '모든 스텝 실행이 한 표에. 성공률 · 실패 · 소요 시간 p50 · p95가 위에 있습니다.',
      point: '표 맨 위에 방금 한 수동 실행 · 재실행',
      go: '#runs', target: '.rn-kpis',
    },
    {
      id: 'runtm', title: '실행 타임머신',
      say: '스텝 하나가 띄운 프로세스 셋. svr_b는 SIGSEGV로 죽었습니다. 실행 → 프로세스 → 서비스로 이어집니다.',
      go: '#runs?flow=BATCH_JOB',
      scene: [{ click: jobRow }, { wait: '.tm-procs .lg-node' }],
      target: '.tm-procs',
    },
  ],
};
