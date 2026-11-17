// 발표자용 순서 가이드 엔진. 써밋 시연판(mock + summit)에서만 app.js가 불러온다.
// 발표자가 화면 옆에서 읽는 큐 카드 · 가리킬 곳의 주황 테두리 · 화면을 덮는 판(표지 · SQL · 끝) · 목차 · 위 막대 칩을 화면 위에 겹쳐 띄운다.
// 화면 코드는 고치지 않는다. 옛 체험 가이드(guide/guide.js)와는 따로 돈다.
//  - 장면(stop)은 막을 가로지르는 한 줄 순서다. ▶가 "누르는" 조작(press)을 대신 하고 다음 장면으로 간다.
//  - 닻 장면(keep 없음)은 주소(go)와 차리기 동작(scene)만으로 차려진다. keep 장면은 앞 장면의 화면 상태를 이어받고,
//    건너뛰어 와서 그 상태가 없으면 가장 가까운 앞쪽 닻부터 scene · press를 다시 해 차린다(되감기).
//  - 차리기 · 넘기기는 한 번에 하나만 돈다. 도는 중에 온 ▶ · ◀는 버리고, goto는 도는 것을 멈추고 새로 한다.
//  - 화면 요소는 주기 갱신으로 계속 새로 만들어진다 → 요소를 쥐지 않고 250ms마다 선택자로 다시 찾는다.
//  - 클릭을 막는 어두운 배경은 없다(판만 화면을 덮는다).
// 내용(장면 · 글 · 선택자)은 summit.js의 SHOW, 모양은 css/stage.css.
import { api } from '../api.js';

const TICK = 250;       // 요소 다시 찾기 주기(ms)
const POLL = 50;        // 동작이 요소 · 조건을 기다릴 때 보는 주기
const T_CLICK = 3000;   // click · fill · scroll이 요소를 기다리는 시한
const T_WAIT = 8000;    // wait · gone의 기본 시한
const T_TARGET = 6000;  // 장면의 target을 기다리는 시한
const LOST_MS = 1200;   // target이 이만큼 안 보이면 '↺ 이 장면으로'
const PULLS = 3;        // 화면이 스스로 굴러 target이 밀려났을 때 다시 끌어오는 횟수(장면마다)
const KEY_GAP = 250;    // 이 안에 다시 온 키는 버린다(리모컨 두 번 눌림)
const STALE_MIN = 10;   // 페이지를 연 지 이만큼(분) 넘으면 칩 옆에 '↻ n분'
const ERR_DWELL = 1500; // 자동 재생: 못 차린 장면에 머무는 시간
const EDGE = 16;        // 카드와 창 가장자리 사이(css/stage.css와 같은 값)
const PAD = 4;          // 테두리와 요소 사이
const HOME = '#dashboard';
const AUTO_KEY = 'eum.stage.auto';   // 자동 재생이 한 바퀴 돌고 새로 고칠 때 남기는 표시(sessionStorage)
const AUTO_Q = '?stage=auto';         // sessionStorage를 못 쓸 때 주소(#dashboard?stage=auto)에 싣는 같은 표시
const DWELL_KEY = 'eum.stage.dwell'; // 검사용: 자동 재생이 머무는 시간을 한 값으로(ms, sessionStorage)
const ROLES = ['viewer', 'operator', 'admin'];
const NAME = '써밋 시연판';
// 내용에 정직 공시가 없을 때 쓰는 글
const NOTES = [
  '모의 데이터입니다. 실제 서버 · 사내 데이터와 연결돼 있지 않습니다.',
  '누른 조작은 이 브라우저 안에서만 반영되고, 새로 고치면 처음으로 돌아갑니다.',
];
const KEYS = [
  ['→ · PageDown · Space', '다음'], ['← · PageUp', '이전'], ['Home', '표지'], ['1–9', '그 번호 막'],
  ['m', '목차'], ['h', '가이드 숨김'], ['a', '자동 재생'], ['r', '처음 상태로'], ['Esc', '목차 · 판 닫기'],
];
const T0 = Date.now(); // 페이지를 연 때(세계의 시각이 여기에 묶인다)

// ---- 작은 도우미 ----
const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== false) : []);
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const warned = new Set();
function warnOnce(what, err) {
  if (warned.has(what)) return;
  warned.add(what);
  console.warn('[순서 가이드]', what, err && err.message ? err.message : err ?? '');
}
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, String(v)); return true; } catch (e) { return false; } },
};
const nameOf = (x) => (typeof x === 'function' ? x.name || '함수' : String(x));

// ---- 내용: 빈 값 · 없는 칸이 있어도 죽지 않게 펼친다 ----
let title = `이음 ${NAME}`;
let notes = NOTES;
const acts = [];  // {no, id, title, first, count}
const stops = []; // 장면 + {id, index, act(막 번호), actId, actTitle}
function load(SHOW) {
  const show = SHOW && typeof SHOW === 'object' ? SHOW : {};
  if (show.title) title = String(show.title);
  const ns = list(show.notes).map(String);
  if (ns.length) notes = ns;
  const ids = new Set();
  for (const a of list(show.acts)) {
    if (typeof a !== 'object') continue;
    const ss = list(a.stops).filter((s) => typeof s === 'object');
    const act = { no: acts.length, id: a.id != null ? String(a.id) : `act${acts.length}`, title: a.title ? String(a.title) : '', first: stops.length, count: ss.length };
    acts.push(act); // 빈 막도 번호는 차지한다(숫자 키가 밀리지 않게)
    for (const s of ss) {
      let id = s.id != null && s.id !== '' ? String(s.id) : `s${stops.length}`;
      if (ids.has(id)) { warnOnce(`장면 id가 겹침: ${id}`); id = `${id}~${stops.length}`; }
      ids.add(id);
      stops.push({ ...s, id, index: stops.length, act: act.no, actId: act.id, actTitle: act.title });
    }
  }
}

// ---- 상태 ----
const st = {
  index: 0, ready: false, error: '',
  hidden: '',        // '' | 'card'(카드 · 테두리만. 칩은 남는다) | 'all'(칩까지)
  auto: false, autoAt: 0,
  toc: false,
  slideOff: false,   // Esc로 판을 닫았다
  lost: false, missAt: 0, at: '',  // at: 차려졌을 때의 화면 경로(target 없는 장면이 화면을 떠났는지 본다)
  pulls: 0, userMoved: false, pulsed: false,
  side: 'right', leaving: false,
};
let layer, card, kick, prog, body, status, foot, bPrev, bNext, bToc, bAuto, bHide, ring, slide, toc, tocBox, chip, chipBtn, staleBtn;
const cur = () => stops[st.index] || null;
const slideOf = (s) => (s && s.slide && typeof s.slide === 'object' ? s.slide : null);
const slideOn = () => !!slideOf(cur()) && !st.slideOff;

// ---- 주소 ----
const dec = (h) => { try { return decodeURIComponent(h); } catch (e) { return h; } };
const normHash = (h) => { const s = dec(String(h || '')); return s === '' || s === '#' ? HOME : s; };
const pathOf = (h) => normHash(h).split('?')[0];
// go가 가리키는 화면에 이미 있는가. go에 쿼리가 없으면 경로만 본다(화면이 스스로 붙인 쿼리는 같은 화면). exact면 통째로.
function sameScreen(go, exact) {
  const now = normHash(location.hash), want = normHash(go);
  return exact || want.includes('?') ? now === want : now.split('?')[0] === want;
}
function goOf(s) {
  try {
    const g = s && typeof s.go === 'function' ? s.go() : s && s.go;
    return g ? String(g) : '';
  } catch (e) { warnOnce(`go() ${s.id}`, e); return ''; }
}

// ---- 요소 찾기 ----
function shown(e) {
  if (!e || !e.isConnected || !e.getBoundingClientRect) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
function firstShown(sel) {
  try {
    for (const e of document.querySelectorAll(sel)) if (shown(e)) return e;
  } catch (err) { warnOnce(`선택자 ${sel}`, err); }
  return null;
}
// 선택자 또는 (doc) => 요소 → 보이는 요소 | null
function pick(x) {
  if (x == null || x === '' || x === true) return null;
  if (typeof x === 'function') {
    try { const e = x(document); return shown(e) ? e : null; } catch (err) { warnOnce(`${nameOf(x)}()`, err); return null; }
  }
  return firstShown(String(x));
}
// 선택자면 보이는가, 함수면 참인가
function holds(x) {
  if (typeof x === 'function') {
    try { return !!x(document); } catch (err) { warnOnce(`${nameOf(x)}()`, err); return false; }
  }
  return !!pick(x);
}
const findTarget = (s) => (s ? pick(s.target) : null);
// 요소가 실제로 보이는 네모: 스크롤 상자(조상)와 창에 잘린 만큼. 다 가려졌으면 null.
function seenRect(e) {
  const r = e.getBoundingClientRect();
  let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
  for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const pr = p.getBoundingClientRect();
      x1 = Math.max(x1, pr.left); y1 = Math.max(y1, pr.top); x2 = Math.min(x2, pr.right); y2 = Math.min(y2, pr.bottom);
    }
    if (cs.position === 'fixed') break; // 창에 붙은 층(서랍 · 확인 창)은 바깥 상자에 잘리지 않는다
  }
  x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, innerWidth); y2 = Math.min(y2, innerHeight);
  return x2 - x1 >= 1 && y2 - y1 >= 1 ? { x1, y1, x2, y2 } : null;
}
function show(t) {
  try { t.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* 무시 */ }
}
// target이 잘려 보이는가: 다 들어갈 크기인데 위아래가 가렸다. 통째로 화면 밖이어도 참.
function cut(t, box) {
  if (!box) return true;
  const h = t.getBoundingClientRect().height;
  return box.y2 - box.y1 < h - 2 && h <= innerHeight - topY();
}
function clickEl(e) {
  if (e.disabled) throw new Error('잠긴 단추');
  if (typeof e.click === 'function') e.click();
  else e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); // SVG 요소
}

// ---- 한 번에 하나: 차리기 · 넘기기는 이 줄을 탄다 ----
const ABORT = { abort: true }; // 도는 중에 goto가 와서 멈출 때 던진다
let running = null;            // 도는 일의 토큰 {dead}
let queued = null;             // 도는 일이 멈추면 할 일(마지막 요청 하나)
// force가 아니면 도는 중에 온 요청은 버린다. → Promise<끝까지 했는가>
function submit(job, force) {
  if (!running) return runJob(job);
  if (!force) return Promise.resolve(false);
  running.dead = true;
  if (queued) queued.done(false);
  return new Promise((done) => { queued = { job, done }; });
}
async function runJob(job) {
  const tk = { dead: false };
  running = tk;
  render(); // 카드에 '장면 차리는 중…'
  let ok = true;
  try { await job(tk); } catch (e) { ok = false; if (e !== ABORT) warnOnce('동작', e); }
  running = null;
  if (queued) { const q = queued; queued = null; runJob(q.job).then(q.done); }
  else { render(); tick(); }
  return ok && !tk.dead;
}
const alive = (tk) => { if (tk && tk.dead) throw ABORT; };
async function sleep(ms, tk) {
  await new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
  alive(tk);
}
// test()가 참이 될 때까지. 시한이 지나면 null
async function until(test, ms, tk) {
  const end = Date.now() + ms;
  for (;;) {
    alive(tk);
    const v = test();
    if (v) return v;
    if (Date.now() >= end) return null;
    await sleep(POLL, tk);
  }
}

// ---- 동작(scene · press의 어휘) ----
async function act(a, tk) {
  if (!a || typeof a !== 'object') return;
  if (a.unless != null && holds(a.unless)) return;
  if (a.click != null) {
    const e = await until(() => pick(a.click), a.ms || T_CLICK, tk);
    if (!e) throw new Error(`누를 곳이 없음: ${nameOf(a.click)}`);
    clickEl(e);
    await sleep(30, tk);
  } else if (a.wait != null) {
    if (!(await until(() => holds(a.wait), a.ms || T_WAIT, tk))) throw new Error(`안 나타남: ${nameOf(a.wait)}`);
  } else if (a.gone != null) {
    if (!(await until(() => !holds(a.gone), a.ms || T_WAIT, tk))) throw new Error(`안 사라짐: ${nameOf(a.gone)}`);
  } else if (a.fill != null) {
    const e = await until(() => pick(a.fill), a.ms || T_CLICK, tk);
    if (!e) throw new Error(`채울 칸이 없음: ${nameOf(a.fill)}`);
    const v = String(a.value ?? '');
    if ('value' in e) e.value = v; else e.textContent = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    if (e.tagName === 'SELECT') e.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof e.blur === 'function') e.blur();
    await sleep(30, tk);
  } else if (a.scroll != null) {
    const e = await until(() => pick(a.scroll), a.ms || T_CLICK, tk);
    if (!e) throw new Error(`굴릴 곳이 없음: ${nameOf(a.scroll)}`);
    show(e);
    await sleep(30, tk);
  } else if (a.sleep != null) {
    await sleep(a.sleep, tk);
  } else if (typeof a.run === 'function') {
    await a.run(document);
    alive(tk);
  } else warnOnce(`모르는 동작: ${Object.keys(a).join(',')}`);
}
async function acts_(arr, tk) {
  for (const a of list(arr)) await act(a, tk);
}
const scene = (s, tk) => acts_(s.scene, tk);
// 이 장면의 "누르는" 조작. from: 목록에서 이 번호부터(발표자가 첫 click을 직접 눌렀을 때)
async function press(s, tk, from = 0) {
  if (!s.press) return;
  const before = location.hash;
  if (s.press === true) {
    const e = await until(() => findTarget(s), T_TARGET, tk);
    if (!e) throw new Error(`누를 곳이 없음: ${s.id}`);
    clickEl(e);
  } else if (Array.isArray(s.press)) await acts_(s.press.slice(from), tk);
  else { warnOnce(`press는 true 또는 동작 목록: ${s.id}`); return; }
  await sleep(location.hash !== before ? 200 : 60, tk); // 주소가 바뀌었으면 옛 화면이 걷힐 틈
}
// press 목록의 첫 click 자리(없으면 -1)
const firstClick = (s) => (Array.isArray(s.press) ? s.press.findIndex((a) => a && typeof a === 'object' && a.click != null) : -1);

// ---- 남은 층 치우기(닻 장면에 들어올 때) ----
async function clearLayers(tk) {
  // 벽면(tv) 나가기: 주소에서 tv를 뗀다(pages/dash.js)
  if (document.body.dataset.tv) {
    const x = document.querySelector('.dv-tvx');
    if (x) { x.click(); await until(() => !document.body.dataset.tv, 2000, tk); }
  }
  // '+ 위젯' 메뉴: 바깥 mousedown으로 닫힌다(pages/dashedit.js)
  if (document.querySelector('.de-menu')) document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  // 창: 위에 뜬 것부터. 수집 마법사는 ✕, AI 초안 · 고르기 창은 배경, 확인 창은 취소(저장 안 한 편집기의 '나가기'만 나가기)
  for (let n = 0; n < 8; n++) {
    const all = document.querySelectorAll('.modal-bg');
    const bg = all[all.length - 1];
    if (!bg) break;
    try {
      if (bg.classList.contains('cw-bg')) (bg.querySelector('.cw-head button') || bg).click();
      else if (bg.classList.contains('de-mbg') || bg.classList.contains('ed-mbg')) bg.click();
      else {
        const head = bg.querySelector('.modal > b');
        const leave = head && head.textContent.trim() === '나가기';
        const b = bg.querySelector(leave ? '.btns button:last-child' : '.btns button:first-child');
        if (b) b.click();
      }
    } catch (e) { warnOnce('창 닫기', e); }
    await sleep(30, tk);
    if (bg.isConnected) bg.remove(); // 닫는 길을 못 찾은 창
  }
  // 서랍
  const x = document.querySelector('#drawer > div > button') || document.getElementById('drawer-bg');
  if (x) { try { x.click(); } catch (e) { warnOnce('서랍 닫기', e); } }
  document.getElementById('drawer')?.remove();
  document.getElementById('drawer-bg')?.remove();
}

// ---- 역할 맞추기: 화면의 로그아웃 → 로그인을 대신 한다 ----
const roleOf = (s) => (ROLES.includes(s && s.as) ? s.as : 'admin');
let roleStuck = ''; // 이 역할로는 못 바꿨다(mock이 id로 역할을 주지 않는 때). 같은 것을 되풀이하지 않는다
async function roleNow() {
  if (document.body.classList.contains('logged-out')) return '';
  try { const m = await api('/me'); return (m && m.role) || ''; } catch (e) { return ''; }
}
// → 로그인을 다시 했는가(화면이 새로 그려졌다)
async function ensureRole(want, tk) {
  const now = await roleNow();
  alive(tk);
  if (now === want || (now && roleStuck === want)) return false;
  if (now) {
    await clearLayers(tk);
    const out = pick('#user button.ghost');
    if (!out) { warnOnce('로그아웃 단추가 없어 역할을 못 바꿈'); return false; }
    out.click();
  }
  const id = await until(() => pick('#login input[name="username"]'), 5000, tk);
  const pw = pick('#login input[name="password"]');
  const form = id && id.closest('form');
  if (!id || !pw || !form) throw new Error('로그인 화면이 안 뜸');
  id.value = want; id.dispatchEvent(new Event('input', { bubbles: true }));
  pw.value = 'summit'; pw.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500, tk); // 넣은 id가 보일 틈
  if (form.requestSubmit) form.requestSubmit(); else form.querySelector('button[type="submit"]')?.click();
  if (!(await until(() => !document.body.classList.contains('logged-out') && !document.getElementById('login'), 5000, tk))) throw new Error('로그인하지 못함');
  await until(() => pick('#user .who'), 3000, tk);
  await sleep(150, tk);
  const got = await roleNow();
  alive(tk);
  if (got !== want) { roleStuck = want; warnOnce(`역할을 ${want}(으)로 못 바꿈(지금 ${got || '없음'})`); } else roleStuck = '';
  return true;
}

// ---- 장면 차리기 ----
async function goHash(h, tk) {
  let fired = false;
  const on = () => { fired = true; };
  window.addEventListener('hashchange', on);
  try {
    location.hash = h;
    await until(() => fired, 600, tk); // app.js의 route()가 옛 화면을 걷은 뒤
  } finally { window.removeEventListener('hashchange', on); }
  await sleep(120, tk);
}
// 닻 장면: 남은 층을 치우고 go + scene
async function anchor(s, tk) {
  await clearLayers(tk);
  const h = goOf(s);
  if (h && !sameScreen(h, s.exact)) await goHash(h, tk);
  await scene(s, tk);
}
// 되감기: 가장 가까운 앞쪽 닻을 차리고, 닻부터 i-1까지 scene · press를 차례로 한 뒤 자기 scene
async function rewind(i, tk) {
  let a = i;
  while (a > 0 && stops[a].keep) a--;
  await anchor(stops[a], tk);
  for (let j = a; j < i; j++) {
    if (j > a) await scene(stops[j], tk);
    await press(stops[j], tk);
  }
  await scene(stops[i], tk);
}
// how: 'flow'(앞 장면에서 ▶로) | 'jump'(목차 · 이전 · 건너뜀) | 'redo'(다시: 닻부터)
async function arrange(i, how, tk) {
  const s = stops[i];
  const fresh = await ensureRole(roleOf(s), tk);
  if (!s.keep) { await anchor(s, tk); return; }
  if (!fresh && how !== 'redo' && (how === 'flow' || (s.target != null && findTarget(s)))) { await scene(s, tk); return; }
  await rewind(i, tk);
}
async function enter(i, how, tk) {
  const n = stops.length;
  if (!n) return;
  i = ((Math.trunc(Number(i) || 0) % n) + n) % n;
  const s = stops[i];
  Object.assign(st, { index: i, ready: false, error: '', slideOff: false, lost: false, missAt: 0, at: '', pulls: 0, userMoved: false, pulsed: false, autoAt: 0, toc: false });
  render();
  let err = '';
  try {
    await arrange(i, how, tk);
    if (s.target != null && !slideOf(s)) {
      const t = await until(() => findTarget(s), T_TARGET, tk);
      if (!t) throw new Error(`가리킬 곳이 안 보임: ${nameOf(s.target)}`);
      show(t);
      await sleep(60, tk);
    }
  } catch (e) {
    if (e === ABORT) throw e;
    err = (e && e.message) || String(e);
    warnOnce(`장면 ${s.id}`, err);
  }
  st.error = err;
  st.ready = !err;
  st.at = pathOf(location.hash);
  st.autoAt = Date.now() + (err ? ERR_DWELL : dwellOf(s));
  render();
  tick();
}
function dwellOf(s) {
  const fixed = Number(store.get(DWELL_KEY));
  if (fixed > 0) return fixed;
  const d = Number(s.dwell);
  return d > 0 ? d : 5000 + String(s.say || '').length * 60;
}
// ▶ 다음: press가 있으면 대신 하고 다음 장면으로. byAuto면 auto: false 장면을 건너뛰고, 끝 뒤에는 새로 고친다.
async function forward(tk, byAuto) {
  const i = st.index, s = stops[i];
  if (!s) return;
  let how = 'flow';
  if (!st.ready || st.lost) how = 'jump'; // 못 차렸거나 화면을 떠나 있었다: 다음 장면이 keep이면 되감는다
  else if (s.press === true && !(await until(() => findTarget(s), 800, tk))) how = 'jump'; // 누를 곳이 방금 사라졌다(서랍을 손으로 닫는 등)
  else if (s.press && !slideOn()) {
    try { await press(s, tk); } catch (e) { if (e === ABORT) throw e; warnOnce(`press ${s.id}`, e); how = 'jump'; }
  }
  let n = i + 1;
  if (byAuto) {
    const skipped = [];
    while (n < stops.length && stops[n].auto === false) skipped.push(stops[n++]);
    if (skipped.length && n < stops.length) {
      // 같은 닻에서 이어지는 장면이면 건너뛴 장면의 scene · press를 조용히 하고 잇는다. 아니면 되감기에 맡긴다.
      let a = n;
      while (a > 0 && stops[a].keep) a--;
      if (how === 'flow' && stops[n].keep && a <= i) {
        try { for (const k of skipped) { await scene(k, tk); await press(k, tk); } } catch (e) { if (e === ABORT) throw e; how = 'jump'; }
      } else how = 'jump';
    }
    if (n >= stops.length) { restart(true); return; }
  } else if (n >= stops.length) { n = 0; how = 'jump'; }
  await enter(n, how, tk);
}
// 발표자가 press 자리를 직접 눌렀다: 목록이면 첫 click 뒤의 나머지를 잇고 다음 장면으로
async function afterPress(i, tk) {
  const s = stops[i];
  let how = 'flow';
  if (Array.isArray(s.press)) {
    try { await press(s, tk, firstClick(s) + 1); } catch (e) { if (e === ABORT) throw e; warnOnce(`press ${s.id}`, e); how = 'jump'; }
  } else await sleep(60, tk);
  if (i + 1 >= stops.length) await enter(0, 'jump', tk);
  else await enter(i + 1, how, tk);
}

// ---- 바깥에서 부르는 것 ----
const next = () => submit((tk) => forward(tk, false));
const prev = () => (st.index > 0 ? submit((tk) => enter(st.index - 1, 'jump', tk)) : Promise.resolve(false));
function indexOf(x) {
  if (typeof x === 'number' && Number.isFinite(x)) return x >= 0 && x < stops.length ? Math.trunc(x) : -1;
  const i = stops.findIndex((s) => s.id === String(x));
  if (i >= 0) return i;
  return /^\d+$/.test(String(x)) && Number(x) < stops.length ? Number(x) : -1;
}
function goto(x, how = 'jump') {
  const i = indexOf(x);
  if (i < 0) { warnOnce(`없는 장면: ${x}`); return Promise.resolve(false); }
  return submit((tk) => enter(i, how, tk), true);
}
function setAuto(on) {
  on = !!on;
  if (st.auto === on) return;
  st.auto = on;
  if (on) st.autoAt = Date.now() + (st.error ? ERR_DWELL : dwellOf(cur() || {}));
  render();
}
function setHidden(v) {
  st.hidden = v === true ? 'all' : v || '';
  if (st.hidden) st.toc = false;
  render();
  tick();
}
function setToc(on) {
  st.toc = !!on && !st.hidden;
  render();
  if (st.toc) (tocBox.querySelector('.sg-ti.on') || tocBox).focus();
}
function closeSlide(off = true) {
  st.slideOff = off;
  render();
  tick();
}
// 처음 상태로: 주소를 #dashboard로 바꾼 뒤(저장 안 한 편집기의 나가기 확인이 걸리지 않게) 새로 고친다.
// 세계가 다시 만들어지고 표지부터 시작한다. keepAuto면 새로 고친 뒤 자동 재생을 잇는다.
function restart(keepAuto) {
  if (st.leaving) return;
  st.leaving = true;
  const kept = store.set(AUTO_KEY, keepAuto ? '1' : null);
  // sessionStorage를 못 쓰는 곳(샌드박스 iframe)에서는 표시를 주소에 싣는다
  const to = keepAuto && !kept ? HOME + AUTO_Q : HOME;
  if (normHash(location.hash) !== to) location.hash = to;
  setTimeout(() => location.reload(), 200);
}

// ---- 키(window capture) ----
const held = new Set(); // keydown을 삼킨 키: 같은 키의 keyup도 삼킨다
let lastKeyAt = 0;
function keyName(ev) {
  const k = ev.key || '';
  if (k === ' ' || k === 'Spacebar') return 'Space';
  // 한글 자판 상태에서 낱자가 오면 자리(code)로 읽는다(m · h · a · r)
  if (k.length === 1 && /[ㄱ-ㅎㅏ-ㅣ]/.test(k) && /^Key[A-Z]$/.test(ev.code || '')) return ev.code.slice(3).toLowerCase();
  return k.length === 1 ? k.toLowerCase() : k;
}
// 이 키로 할 일의 이름. 우리 키가 아니면 ''
function keyJob(ev, k) {
  if (!stops.length || st.leaving) return '';
  if (document.body.classList.contains('logged-out')) return '';
  if (ev.isComposing || ev.keyCode === 229) return ''; // 한글 조합 중
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return '';
  if (k === 'PageDown') return 'next';
  if (k === 'PageUp') return 'prev';
  const t = ev.target;
  const within = (sel) => !!(t && t.closest && t.closest(sel));
  if (within('input, textarea, select, [contenteditable]')) return '';
  if (k === 'ArrowRight') return 'next';
  if (k === 'ArrowLeft') return 'prev';
  if (k === 'Space') return st.toc && within('.sg-toc') ? '' : 'next'; // 목차 안에서는 고른 줄을 누르는 키
  if (k === 'Home') return 'home';
  if (/^[1-9]$/.test(k)) return acts[Number(k)] && acts[Number(k)].count ? 'act' : '';
  if (k === 'm') return 'toc';
  if (k === 'h') return 'hide';
  if (k === 'a') return 'auto';
  if (k === 'r') return 'reset';
  if (k === 'Escape') return st.toc || slideOn() ? 'esc' : '';
  return '';
}
function onKeyDown(ev) {
  const k = keyName(ev);
  const job = keyJob(ev, k);
  if (ev.isTrusted && job !== 'auto') { if (st.auto) setAuto(false); if (!job) st.userMoved = true; }
  if (!job) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  held.add(ev.code || k);
  const now = Date.now();
  if (ev.repeat || now - lastKeyAt < KEY_GAP) return;
  lastKeyAt = now;
  if (job === 'next') next();
  else if (job === 'prev') prev();
  else if (job === 'home') goto(0);
  else if (job === 'act') goto(acts[Number(k)].first);
  else if (job === 'toc') setToc(!st.toc);
  else if (job === 'hide') setHidden(st.hidden ? '' : 'all');
  else if (job === 'auto') setAuto(!st.auto);
  else if (job === 'reset') restart(false);
  else if (job === 'esc') { if (st.toc) setToc(false); else closeSlide(); }
}
function onKeyUp(ev) {
  const id = ev.code || keyName(ev);
  if (!held.delete(id)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
}
// 사람이 건드리면 자동 재생을 멈춘다(자동 단추 자체는 뺀다). 스스로 굴리면 target을 억지로 끌어오지 않는다.
function onTouch(ev) {
  if (!ev.isTrusted) return;
  const t = ev.target;
  const mine = !!(t && t.closest && t.closest('.sg-layer, .sg-chip, .sg-slide'));
  if (st.auto && !(t && t.closest && t.closest('.sg-auto'))) setAuto(false);
  if (!mine) st.userMoved = true;
}
// 발표자가 press 자리를 직접 눌렀는가: capture에서 보고, 화면이 그 클릭을 다 처리한 뒤에 잇는다.
function onDocClick(ev) {
  if (!ev.isTrusted || running || !st.ready || slideOn()) return;
  const s = cur();
  const t = ev.target;
  if (!s || !s.press || !t || !t.closest || t.closest('.sg-layer, .sg-chip, .sg-slide')) return;
  let spot = null;
  if (s.press === true) spot = findTarget(s);
  else { const k = firstClick(s); if (k >= 0) spot = pick(s.press[k].click); }
  if (!spot || !spot.contains(t)) return;
  const at = st.index;
  setTimeout(() => { if (st.index === at && !running) submit((tk) => afterPress(at, tk)); }, 0);
}

// ---- 테두리 · 카드 자리 ----
function drawRing(box) {
  if (!box) { ring.hidden = true; return; }
  const x = Math.max(2, box.x1 - PAD), y = Math.max(2, box.y1 - PAD);
  const w = Math.min(innerWidth - 2, box.x2 + PAD) - x, h = Math.min(innerHeight - 2, box.y2 + PAD) - y;
  ring.style.left = `${x}px`; ring.style.top = `${y}px`;
  ring.style.width = `${Math.max(0, w)}px`; ring.style.height = `${Math.max(0, h)}px`;
  ring.hidden = false;
  if (!st.pulsed) { // 들어올 때 한 번 맥박
    st.pulsed = true;
    ring.classList.remove('sg-in');
    void ring.offsetWidth;
    ring.classList.add('sg-in');
  }
}
// 카드를 위에 둘 때의 윗변: 위 막대 바로 아래
function topY() {
  const t = document.getElementById('top');
  return Math.max(0, t ? t.getBoundingClientRect().bottom : 0) + 12;
}
// 카드를 둘 쪽: 기본 오른쪽 아래. 오른쪽 서랍이 열려 있으면 왼쪽(서랍 안을 가리지 않게).
// 테두리와 겹치면 반대쪽 아래 → 오른쪽 위. 셋 다 겹치면 가장 덜 가리는 쪽.
function pickSide(box) {
  const c = card.getBoundingClientRect();
  const d = document.querySelector('.drawer');
  const dl = d && shown(d) ? d.getBoundingClientRect().left : innerWidth;
  const pref = dl < innerWidth - EDGE && dl > EDGE + (c.width || 400) ? 'left' : 'right';
  if (!box || !c.width) return pref;
  const gap = PAD + 6;
  const over = (l, t) => {
    const w = Math.min(box.x2 + gap, l + c.width) - Math.max(box.x1 - gap, l);
    const h = Math.min(box.y2 + gap, t + c.height) - Math.max(box.y1 - gap, t);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const low = innerHeight - EDGE - c.height, far = innerWidth - EDGE - c.width;
  const at = { right: over(far, low), left: over(EDGE, low), top: over(far, topY()) };
  const opp = pref === 'left' ? 'right' : 'left';
  if (!at[pref]) return pref;
  if (!at[opp]) return opp;
  if (!at.top && pref === 'right') return 'top'; // 서랍이 열려 있으면 오른쪽 위는 서랍 안이다
  const order = pref === 'right' ? [pref, opp, 'top'] : [pref, opp];
  let best = st.side in at && order.includes(st.side) ? st.side : pref; // 차이가 뚜렷할 때만 옮긴다
  for (const k of order) if (at[k] < at[best] * 0.6) best = k;
  return best;
}
function setSide(side) {
  if (st.side !== side) {
    st.side = side;
    card.classList.toggle('sg-left', side === 'left');
    card.classList.toggle('sg-top', side === 'top');
  }
  card.style.top = side === 'top' ? `${topY()}px` : '';
  measure();
}
// 카드 윗변에서 창 아래까지. 토스트가 카드 위로 비키는 데 쓴다(css/stage.css).
function measure() {
  const r = card.getBoundingClientRect();
  const low = !st.hidden && st.side === 'right' && r.height;
  document.body.style.setProperty('--sg-h', `${low ? Math.max(0, Math.round(innerHeight - r.top)) : 0}px`);
}
let moveReq = 0;
function onMove() {
  if (moveReq) return;
  moveReq = requestAnimationFrame(() => { moveReq = 0; place(); });
}
// 테두리와 카드 자리만 다시 맞춘다
function place() {
  const s = cur();
  const on = !!s && st.ready && !running && !st.hidden && !slideOn();
  const t = on ? findTarget(s) : null;
  const box = t ? seenRect(t) : null;
  drawRing(box);
  setSide(pickSide(box));
  return { t, box };
}

// ---- 250ms마다: target · 길 잃음 · 자동 재생 · 연 지 n분 ----
function tick() {
  const now = Date.now();
  drawStale(now);
  const s = cur();
  if (!s) return;
  if (st.ready && !running && !slideOn()) {
    let lost = st.lost;
    if (s.target != null) {
      const t = findTarget(s);
      if (t) {
        st.missAt = 0; lost = false;
        // 화면이 스스로 밀어냈으면(발표자가 굴리지 않았으면) 다시 가운데로
        if (!st.hidden && !st.userMoved && st.pulls < PULLS && cut(t, seenRect(t))) { st.pulls++; show(t); }
      } else {
        if (!st.missAt) st.missAt = now;
        lost = now - st.missAt > LOST_MS;
      }
    } else lost = !!st.at && pathOf(location.hash) !== st.at; // target 없는 장면: 차려졌을 때의 화면을 떠났다
    if (lost !== st.lost) { st.lost = lost; drawStatus(); }
  }
  place();
  if (st.auto && !running && !st.leaving && st.autoAt && now >= st.autoAt && !document.body.classList.contains('logged-out')) {
    st.autoAt = 0;
    submit((tk) => forward(tk, true));
  }
}
function drawStale(now) {
  const min = Math.floor((now - T0) / 60000);
  if (staleBtn) {
    staleBtn.hidden = min < STALE_MIN;
    const txt = `↻ ${min}분`;
    if (staleBtn.textContent !== txt) staleBtn.textContent = txt;
  }
  const age = toc.querySelector('.sg-age');
  if (age && st.toc) age.textContent = `연 지 ${min}분`;
}

// ---- 그리기 ----
function render() {
  const s = cur();
  const hid = !!st.hidden;
  document.body.classList.toggle('sg-hide', hid);
  card.hidden = hid || !s;
  if (chip) chip.hidden = st.hidden === 'all';
  if (chipBtn) chipBtn.setAttribute('aria-pressed', String(!hid));
  drawSlide();
  drawToc();
  if (!s) return;
  const a = acts[s.act] || {};
  kick.replaceChildren(...[el('b', { text: `막 ${s.act}` }), a.title ? ` · ${a.title}` : '',
    roleOf(s) !== 'admin' ? el('span', { class: 'sg-tag', title: '이 장면의 역할', text: s.as }) : '',
    el('span', { class: 'sg-n', text: `${st.index + 1}/${stops.length}` })]);
  drawProg();
  const kids = [el('h3', { class: 'sg-t', text: s.title || '' })];
  if (s.say) kids.push(el('p', { class: 'sg-say', text: String(s.say) }));
  if (s.point) kids.push(el('p', { class: 'sg-pt' }, el('i', { 'aria-hidden': 'true', text: '☞' }), el('span', { text: String(s.point) })));
  if (s.hand) kids.push(el('p', { class: 'sg-hd' }, el('i', { 'aria-hidden': 'true', text: '✋' }), el('span', { text: String(s.hand) })));
  body.replaceChildren(...kids);
  drawStatus();
  const pressing = !!s.press && st.ready && !st.lost && !slideOn();
  bNext.textContent = pressing ? '누르기 ▶' : '▶';
  bNext.title = pressing ? '표시한 곳을 대신 누르고 다음으로 (→ · PageDown · Space)' : '다음 (→ · PageDown · Space)';
  bPrev.classList.toggle('off', st.index <= 0);
  bPrev.setAttribute('aria-disabled', String(st.index <= 0));
  bAuto.setAttribute('aria-pressed', String(st.auto));
  bToc.setAttribute('aria-expanded', String(st.toc));
  card.classList.toggle('sg-busy', !!running);
  measure();
}
// 막 단위로 끊긴 진행 줄
function drawProg() {
  prog.replaceChildren(...acts.filter((a) => a.count).map((a) => {
    const done = Math.max(0, Math.min(a.count, st.index - a.first + 1));
    return el('i', { style: `flex:${a.count}`, class: st.index >= a.first && st.index < a.first + a.count ? 'on' : '' },
      el('b', { style: `width:${Math.round((done / a.count) * 100)}%` }));
  }));
}
// 카드의 상태 줄: 자동 재생 · 차리는 중 · 못 차림 · 이 장면으로 · 판 다시
function drawStatus() {
  const rows = [];
  if (st.auto) rows.push(el('div', { class: 'sg-st auto' }, el('i', { class: 'sg-dot', 'aria-hidden': 'true' }), '자동 재생 중 · 건드리면 멈춤'));
  if (running) rows.push(el('div', { class: 'sg-st busy' }, el('i', { class: 'sg-spin', 'aria-hidden': 'true' }), '장면 차리는 중…'));
  else if (st.error) {
    rows.push(el('div', { class: 'sg-st err', title: st.error }, el('span', { text: '장면을 차리지 못함' }),
      el('button', { type: 'button', class: 'sg-btn', text: '다시', title: '닻 장면부터 다시 차린다', onclick: () => goto(st.index, 'redo') })));
  } else if (st.lost) {
    rows.push(el('div', { class: 'sg-st' },
      el('button', { type: 'button', class: 'sg-btn', text: '↺ 이 장면으로', onclick: () => goto(st.index) })));
  } else if (slideOf(cur()) && st.slideOff) {
    rows.push(el('div', { class: 'sg-st' },
      el('button', { type: 'button', class: 'sg-btn', text: '▣ 판 다시', onclick: () => closeSlide(false) })));
  }
  status.replaceChildren(...rows);
  status.hidden = !rows.length;
}

// 판: 있는 필드만 그린다. { kind, kicker, title, lead, chips: [], blocks: [{ label, cmd, out }], foot }
function drawSlide() {
  const s = cur();
  const sl = slideOf(s);
  const on = !!sl && !st.slideOff;
  document.body.classList.toggle('sg-slide-on', on);
  slide.hidden = !on;
  if (!on) { slide.dataset.id = ''; return; }
  if (slide.dataset.id === s.id) return;
  slide.dataset.id = s.id;
  const kind = ['cover', 'sql', 'end'].includes(sl.kind) ? sl.kind : 'cover';
  slide.className = `sg-slide sg-${kind}`;
  const txt = (v) => (v == null || v === '' ? '' : String(v));
  const kids = [];
  if (txt(sl.kicker)) kids.push(el('div', { class: 'sg-sk', text: txt(sl.kicker) }));
  if (txt(sl.title)) kids.push(el('h1', { class: 'sg-sh', text: txt(sl.title) }));
  if (txt(sl.lead)) kids.push(el('p', { class: 'sg-sl', text: txt(sl.lead) }));
  const chips = list(sl.chips).map(txt).filter(Boolean);
  if (chips.length) kids.push(el('ul', { class: 'sg-sc' }, chips.map((c) => el('li', { text: c }))));
  const blocks = list(sl.blocks).filter((b) => typeof b === 'object' && (txt(b.cmd) || txt(b.out) || txt(b.label)));
  for (const b of blocks) {
    kids.push(el('section', { class: 'sg-term' },
      txt(b.label) ? el('div', { class: 'sg-tl', text: txt(b.label) }) : null,
      txt(b.cmd) ? el('pre', { class: 'sg-cmd' }, el('span', { class: 'sg-ps', 'aria-hidden': 'true', text: '$ ' }), txt(b.cmd)) : null,
      txt(b.out) ? el('pre', { class: 'sg-out', text: txt(b.out) }) : null));
  }
  if (kind === 'end') {
    kids.push(el('dl', { class: 'sg-keys' }, KEYS.map(([k, d]) => el('div', {}, el('dt', { text: k }), el('dd', { text: d })))));
  }
  if (txt(sl.foot)) kids.push(el('p', { class: 'sg-sf', text: txt(sl.foot) }));
  if (kind === 'cover') kids.push(el('button', { type: 'button', class: 'sg-go', text: '→ 시작', onclick: next }));
  slide.replaceChildren(el('div', { class: 'sg-si' }, kids));
  slide.scrollTop = 0;
  fitTerm();
}
// 결과 표가 터미널 칸보다 넓으면 글자를 줄여 맞춘다(원문 줄바꿈은 그대로)
function fitTerm() {
  for (const t of slide.querySelectorAll('.sg-term')) {
    t.style.fontSize = '';
    let size = parseFloat(getComputedStyle(t).fontSize) || 20;
    const wide = () => [...t.querySelectorAll('pre')].some((p) => p.scrollWidth > p.clientWidth + 1);
    while (size > 12 && wide()) { size -= 1; t.style.fontSize = `${size}px`; }
  }
}

// 목차: 막별 장면 목록 · 키 안내 · 정직 공시 · 처음 상태로 · 연 지 n분
function buildToc() {
  tocBox = el('div', { class: 'sg-toc', role: 'dialog', 'aria-modal': 'true', 'aria-label': '목차', tabindex: '-1' },
    el('div', { class: 'sg-th' },
      el('b', { text: title }),
      el('span', { class: 'sg-age' }),
      el('span', { class: 'sg-grow' }),
      el('button', { type: 'button', class: 'sg-btn', text: '처음 상태로 ↻', title: '세계를 다시 만들고 표지부터 (r)', onclick: () => restart(false) }),
      el('button', { type: 'button', class: 'sg-btn quiet', text: '✕', title: '닫기 (m · Esc)', 'aria-label': '목차 닫기', onclick: () => setToc(false) })),
    el('div', { class: 'sg-ta' }, acts.filter((a) => a.count).map((a) => el('section', { class: 'sg-tact' },
      el('h4', {}, el('b', { text: `막 ${a.no}` }), a.title ? ` ${a.title}` : ''),
      el('ol', {}, stops.slice(a.first, a.first + a.count).map((s) => el('li', {},
        el('button', { type: 'button', class: 'sg-ti', 'data-i': String(s.index), onclick: () => goto(s.index) },
          el('span', { class: 'sg-no', text: String(s.index + 1) }), el('span', { text: s.title || s.id }),
          s.press ? el('span', { class: 'sg-tag', title: '누르는 장면', text: '▶' }) : null,
          roleOf(s) !== 'admin' ? el('span', { class: 'sg-tag', title: '이 역할로 로그인', text: s.as }) : null))))))),
    el('div', { class: 'sg-tf' },
      el('dl', { class: 'sg-keys' }, KEYS.map(([k, d]) => el('div', {}, el('dt', { text: k }), el('dd', { text: d })))),
      el('ul', { class: 'sg-notes' }, notes.map((t) => el('li', { text: t })))));
  toc = el('div', { class: 'sg-tocbg', hidden: true, onclick: (e) => { if (e.target === toc) setToc(false); } }, tocBox);
}
function drawToc() {
  toc.hidden = !st.toc;
  if (!st.toc) return;
  for (const b of tocBox.querySelectorAll('.sg-ti')) {
    const on = Number(b.dataset.i) === st.index;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  }
  const on = tocBox.querySelector('.sg-ti.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
  drawStale(Date.now());
}

// ---- 붙이기 ----
function build() {
  kick = el('div', { class: 'sg-k' });
  prog = el('div', { class: 'sg-prog', 'aria-hidden': 'true' });
  body = el('div', { class: 'sg-b' });
  status = el('div', { class: 'sg-sts', 'aria-live': 'polite', hidden: true });
  bPrev = el('button', { type: 'button', class: 'sg-btn', text: '◀', title: '이전 (← · PageUp)', 'aria-label': '이전 장면', onclick: prev });
  bNext = el('button', { type: 'button', class: 'sg-btn pri', text: '▶', 'aria-label': '다음 장면', onclick: next });
  bToc = el('button', { type: 'button', class: 'sg-btn', text: '목차', title: '목차 (m)', onclick: () => setToc(!st.toc) });
  bAuto = el('button', { type: 'button', class: 'sg-btn sg-auto', text: '자동', title: '자동 재생 (a)', 'aria-pressed': 'false', onclick: () => setAuto(!st.auto) });
  bHide = el('button', { type: 'button', class: 'sg-btn quiet', text: '숨김', title: '카드 · 테두리 숨김. 위 막대의 칩을 누르면 다시 보인다 (h는 칩까지)', onclick: () => setHidden('card') });
  foot = el('div', { class: 'sg-f' }, bPrev, bNext, el('span', { class: 'sg-grow' }), bToc, bAuto, bHide);
  card = el('section', { class: 'sg', id: 'stage-card', role: 'region', 'aria-label': '순서 가이드', hidden: true }, kick, prog, body, status, foot);
  ring = el('div', { class: 'sg-ring', hidden: true, 'aria-hidden': 'true' });
  buildToc();
  // 모양(css/stage.css)이 올 때까지 숨겨 둔다
  layer = el('div', { class: 'sg-layer', hidden: true }, ring, card, toc);
  slide = el('div', { class: 'sg-slide', hidden: true });
  document.body.append(slide, layer);
  // 위 막대 로고 옆 칩: 누르면 카드 숨김/보임, ⓘ에 정직 공시, 오래 켜 두면 '↻ n분'
  const logo = document.querySelector('#top .logo');
  if (logo) {
    chipBtn = el('button', { type: 'button', class: 'sg-chipb', title: '순서 가이드 숨김 · 보임', 'aria-pressed': 'true', text: NAME, onclick: () => setHidden(st.hidden ? '' : 'card') });
    staleBtn = el('button', { type: 'button', class: 'sg-stale', hidden: true, title: '오래 켜 둬 알림 시각이 묵었습니다. 누르면 처음 상태로', onclick: () => restart(false) });
    chip = el('span', { class: 'sg-chip', hidden: true }, chipBtn,
      el('span', { class: 'tip', tabindex: '0', 'aria-label': '시연판 안내' }, 'ⓘ',
        el('span', { class: 'tipbox' }, notes.map((t) => el('span', { class: 'sg-tipl', text: t })))),
      staleBtn);
    logo.after(chip);
  }
}
function addCss(onReady) {
  let fired = false;
  const ready = () => { if (!fired) { fired = true; onReady(); } };
  document.head.append(el('link', { rel: 'stylesheet', href: new URL('../css/stage.css', import.meta.url).href, onload: ready, onerror: ready }));
  setTimeout(ready, 3000);
}

let started = false;
export async function startStage() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.body.classList.add('stage');
  document.title = `이음 ${NAME}`;
  // 내용 파일이 깨져 있어도 화면은 멀쩡해야 한다
  try { load((await import('./summit.js')).SHOW); } catch (e) { warnOnce('내용(summit.js)을 읽지 못함', e); }
  if (!stops.length) warnOnce('장면이 없음');
  build();
  // 자동 재생이 한 바퀴 돌고 새로 고친 것이면 이어 돈다. 표시는 지운다(사람이 새로 고치면 자동 재생은 꺼진 채 시작).
  if (store.get(AUTO_KEY) === '1') st.auto = true;
  store.set(AUTO_KEY, null);
  if (normHash(location.hash) === HOME + AUTO_Q) {
    st.auto = true;
    try { history.replaceState(null, '', location.pathname + location.search + HOME); } catch (e) { /* 주소는 그대로 둔다 */ }
  }
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  for (const ev of ['mousedown', 'wheel', 'touchstart']) window.addEventListener(ev, onTouch, { capture: true, passive: true });
  document.addEventListener('click', onDocClick, true);
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', () => { onMove(); if (!slide.hidden) fitTerm(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onMove).observe(card);
  setInterval(tick, TICK);
  // 검사 손잡이(자동 확인 스크립트가 쓴다)
  window.__eumStage = {
    stops,
    state: () => {
      const s = cur();
      return {
        index: st.index, id: s ? s.id : null, act: s ? s.actId : null, busy: !!running, ready: st.ready, error: st.error,
        hidden: !!st.hidden, auto: st.auto, toc: st.toc, slide: slideOn() ? slideOf(s).kind || 'cover' : null,
        lost: st.lost, side: st.side, ring: !ring.hidden,
      };
    },
    goto: (x) => goto(x),
    next, prev,
    // dwell(ms)을 주면 자동 재생이 모든 장면에 그만큼만 머문다(검사용. 새로 고쳐도 남는다. 0이면 지운다)
    auto: (on, dwell) => { if (dwell != null) store.set(DWELL_KEY, Number(dwell) > 0 ? Number(dwell) : null); setAuto(on !== false); },
    hide: (on) => setHidden(on !== false ? 'all' : ''),
    toc: (on) => setToc(on !== false),
    reset: () => restart(false),
  };
  addCss(() => {
    layer.hidden = false;
    if (chip) chip.hidden = false;
    render();
    if (stops.length) submit((tk) => enter(0, 'jump', tk), true);
  });
}
