// 라우터 · 위 막대 · 시계 · 알림 종 · 테마.
import { api, poll, stopScope, onHealth, isHealthy, onAuthRequired, onForbidden, onPollState, pollState, ApiError } from './api.js';
import { createTree, parseRoute } from './tree.js';
import { fmtClock, toast, stateBox, setTitle, setTitleCount } from './ui.js';
import { initQuickJump } from './quickjump.js';
import { loadMe, logout, showLogin, drawUser, roleName } from './auth.js';

const PAGES = {
  dashboard: './pages/dashboard.js',
  hosts: './pages/server.js', host: './pages/server.js',
  board: './pages/batch.js', runs: './pages/runs.js',
  edit: './pages/editor.js', biz: './pages/biz.js',
  audit: './pages/audit.js', collect: './pages/collect.js',
  run: './pages/tm.js', alerts: './pages/alerts.js', risk: './pages/risk.js',
  'dev/flame': './pages/devflame.js',
  exit: './pages/exit.js', exits: './pages/exits.js',
  svc: './pages/svc.js', svcs: './pages/svc.js',
  dashes: './pages/dash.js', dash: './pages/dash.js', dashedit: './pages/dashedit.js', // 사용자 보드(07)
};
// 문서 제목에 쓰는 화면 이름. 상세 화면이 더 자세한 제목으로 덮어써도 된다.
const TITLE = {
  dashboard: '관제', hosts: '서버', host: '서버', collect: '로그 수집',
  board: '배치', edit: '플로우 편집', biz: '업무', svcs: '서비스', svc: '서비스 타임머신',
  dashes: '보드', dash: '보드', dashedit: '보드 편집',
  runs: '실행', run: '타임머신', exits: '종료 보고서', exit: '종료 보고서',
  alerts: '알림', risk: '장애 위험도', audit: '감사 기록', 'dev/flame': '플레임 그래프',
};
const MENU = { dashboard: 'dashboard', hosts: 'hosts', host: 'hosts', collect: 'hosts', board: 'board', edit: 'board', biz: 'biz', runs: 'runs', run: 'runs', exit: 'runs', exits: 'runs', svc: 'biz', svcs: 'biz', dashes: 'dashes', dash: 'dashes', dashedit: 'dashes' };

let boards = new Set();
let current = null;
let currentPath = ''; // current를 불러온 PAGES 경로
let seq = 0;

// 종료 보고서 #exit/<id>는 트리의 경로 해석(parseRoute) 밖이라 여기서 먼저 본다.
function routeOf(hash) {
  const m = /^#exit\/([^/?]*)(?:\?(.*))?$/.exec(String(hash || ''));
  if (!m) return parseRoute(hash, boards);
  let id = m[1];
  try { id = decodeURIComponent(id); } catch (e) { /* 그대로 */ }
  return { name: 'exit', params: { id }, query: Object.fromEntries(new URLSearchParams(m[2] || '')) };
}

async function route() {
  const my = ++seq;
  const r = routeOf(location.hash);
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('on', a.dataset.m === MENU[r.name]));
  document.body.dataset.page = r.name;
  const on = document.querySelector('#menu a.on');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  setTitle(TITLE[r.name] || '');
  // 같은 화면 파일 안의 이동(보드 고르기·뒤로 가기)은 그 화면의 reroute(params, query)가 true면 다시 그리지 않는다
  if (current && current.reroute && currentPath === PAGES[r.name]) {
    try { if (current.reroute(r.params, r.query)) return; } catch (e) { console.error(e); }
  }
  if (current && current.dispose) { try { current.dispose(); } catch (e) { console.error(e); } }
  current = null;
  currentPath = '';
  stopScope();
  const page = document.getElementById('page');
  page.replaceChildren();
  try {
    const mod = await import(PAGES[r.name]);
    if (my !== seq) return;
    current = mod;
    currentPath = PAGES[r.name];
    await mod.render(page, r.params, r.query);
  } catch (e) {
    if (!(e instanceof ApiError)) console.error(e); // 서버 응답 실패는 화면에 까닭을 보인다. 코드 오류만 콘솔에
    if (my !== seq) return;
    // 다시 시도가 reroute에 막히지 않게 실패한 화면은 내려놓는다
    if (current && current.dispose) { try { current.dispose(); } catch (e2) { console.error(e2); } }
    current = null;
    currentPath = '';
    page.replaceChildren(stateBox('error', { text: '화면을 그리지 못함', e, retry: route }));
  }
  // 화면을 옮긴 뒤 포커스는 화면 칸으로(화면이 스스로 옮겨 둔 포커스는 그대로)
  if (my === seq && !page.contains(document.activeElement)) page.focus({ preventScroll: true });
}

function initTheme() {
  const root = document.documentElement;
  let t = null;
  try { t = localStorage.getItem('eum.theme'); } catch (e) { /* 편의 기능 */ }
  if (t === 'dark' || t === 'light') root.dataset.theme = t;
  document.getElementById('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('eum.theme', root.dataset.theme); } catch (e) { /* 무시 */ }
  });
}

function initTop() {
  const dot = document.getElementById('dot'), warn = document.getElementById('warnbar');
  const apply = (ok) => {
    dot.className = 'dot ' + (ok ? 'ok' : 'fail');
    const t = ok ? '연결됨' : '응답 실패';
    dot.title = t; dot.setAttribute('aria-label', t);
    warn.hidden = ok;
  };
  onHealth(apply); apply(isHealthy());
  // 갱신 끊김: poll이 2번 이어 실패하면 마지막으로 받은 시각부터 표시한다
  const stale = document.getElementById('stale');
  const applyStale = (st) => {
    if (st.failing) {
      stale.textContent = `갱신 끊김 ${st.lastOk ? fmtClock(st.lastOk) : '--:--:--'}~`;
      stale.hidden = false;
      document.body.dataset.stale = '1';
    } else {
      stale.hidden = true;
      delete document.body.dataset.stale;
    }
  };
  onPollState(applyStale); applyStale(pollState());
  const tick = () => { document.getElementById('clock-t').textContent = fmtClock(Date.now()); };
  tick(); setInterval(tick, 1000);
  poll(async () => {
    const r = await api('/alerts?state=firing');
    const n = (r.alerts || []).filter((a) => !a.acked_at).length;
    document.getElementById('bell-n').textContent = String(n);
    const bell = document.getElementById('bell');
    bell.classList.toggle('has', n > 0);
    bell.setAttribute('aria-label', `알림 ${n}건`);
    setTitleCount(n);
  }, 5000, { global: true });
}

// 로그인 화면을 띄우고, 로그인하면 사용자 칸을 채우고 현재 해시의 화면을 다시 그린다.
let relogin = null;
function askLogin(note) {
  if (relogin) return relogin;
  stopScope();
  if (current && current.dispose) { try { current.dispose(); } catch (e) { console.error(e); } }
  current = null;
  currentPath = '';
  document.getElementById('page').replaceChildren();
  relogin = (async () => {
    await showLogin(note);
    await loadMe();
    drawUser(document.getElementById('user'), doLogout);
    relogin = null;
    route();
  })();
  return relogin;
}
async function doLogout() {
  await logout();
  askLogin('');
}

// 트리 여닫기: 넓은 화면은 자리를 차지하고(eum.tree.hidden에 기억), 좁은 화면(#tree가 fixed가 되는 구간, css/shell.css)은 서랍으로 덮는다.
function initTreeToggle() {
  const btn = document.getElementById('tree-toggle'), tree = document.getElementById('tree'), scrim = document.getElementById('tree-scrim');
  const overlay = () => getComputedStyle(tree).position === 'fixed';
  const stored = () => { try { return localStorage.getItem('eum.tree.hidden') === '1'; } catch (e) { return false; } };
  let drawer = innerWidth > 900 && !stored(); // 서랍 기본값: 900px 이하는 닫힘
  let wasOverlay = overlay();
  const sync = () => {
    const ov = overlay();
    if (ov !== wasOverlay) { wasOverlay = ov; if (ov) drawer = false; }
    document.body.classList.toggle('tree-off', !ov && stored());
    document.body.classList.toggle('tree-open', ov && drawer);
    scrim.hidden = !(ov && drawer);
    btn.setAttribute('aria-expanded', String(ov ? drawer : !stored()));
  };
  const close = (back) => { if (!drawer) return; drawer = false; sync(); if (back) btn.focus(); };
  btn.addEventListener('click', () => {
    if (overlay()) {
      drawer = !drawer; sync();
      if (drawer) { const q = tree.querySelector('input'); if (q) q.focus(); } else btn.focus();
    } else {
      try { localStorage.setItem('eum.tree.hidden', stored() ? '0' : '1'); } catch (e) { /* 편의 기능 */ }
      sync();
    }
  });
  scrim.addEventListener('click', () => close(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay() && drawer) { e.preventDefault(); close(true); } });
  window.addEventListener('hashchange', () => { if (overlay()) close(false); });
  window.addEventListener('resize', sync);
  sync();
}

// 600px 이하: 감사 기록·사용자·로그아웃(#user)은 ⋯ 단추의 작은 메뉴로
function initMore() {
  const btn = document.getElementById('more'), box = document.getElementById('user');
  const set = (open) => { document.body.classList.toggle('more-open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(!document.body.classList.contains('more-open')); });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('more-open')) { set(false); btn.focus(); } });
  window.addEventListener('hashchange', () => set(false));
}

function start() {
  initTop();
  initTreeToggle();
  initMore();
  initQuickJump();
  const tree = createTree(document.getElementById('tree'), { onBoards: (b) => { boards = b; } });
  onAuthRequired(() => askLogin('세션이 끝났습니다. 다시 로그인해 주세요'));
  onForbidden((need) => toast(`권한이 없습니다(${roleName(need)} 이상)`));
  window.addEventListener('hashchange', route);
  tree.ready.finally(route);
}

async function boot() {
  initTheme();
  if ((await loadMe()) === 'login') {
    await showLogin();
    await loadMe();
  }
  drawUser(document.getElementById('user'), doLogout);
  start();
}
boot();
