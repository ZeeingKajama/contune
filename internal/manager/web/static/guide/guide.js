// 체험 가이드 엔진. 체험판(mock + lite)에서만 app.js가 불러온다.
// 화면 위에 겹쳐 뜨는 층 셋: 카드(#guide) · 강조 테두리(.eg-ring) · 위 막대 칩(.eg-chip). 화면 코드는 고치지 않는다.
//  - 화면 요소는 주기 갱신으로 계속 새로 만들어진다 → 요소를 쥐지 않고 250ms마다, 스크롤·크기 변화 때 선택자로 다시 찾는다.
//  - 화면 코드가 stopPropagation을 쓴다 → 누르기는 document의 capture 단계에서 본다.
//  - 클릭을 막는 어두운 배경은 쓰지 않는다(사용자가 실제 요소를 누른다).
// 내용(문구 · 선택자)은 tours.js, 모양은 css/guide.css. 다른 모듈은 쓰지 않는다.
import { INTRO, TOURS, MORE } from './tours.js';

const TICK = 250;      // 요소 다시 찾기 · 조건 확인 주기(ms)
const LOST_MS = 4000;  // 목표가 이만큼 안 보이면 '이 단계 화면으로' 단추
const OFF_MS = 1500;   // 목표가 화면 밖에 이만큼 있으면 '표시된 곳으로' 단추
const PULLS = 3;       // 화면이 스스로 굴러 목표가 밀려났을 때 다시 끌어오는 횟수(단계마다)
const GO_WAIT = 600;   // 누르기 · 조건으로 넘어온 단계는 화면이 스스로 바뀔 틈을 준 뒤에 go를 건다
const NARROW = 600;    // 이 폭 이하면 카드는 아래 전체 폭(css/guide.css와 같은 값)
const EDGE = 16;       // 카드와 창 가장자리 사이(css/guide.css와 같은 값)
const DONE_KEY = 'eum.guide.done';
const HINT_CLICK = '표시된 곳을 눌러 보세요';
const HINT_WAIT = '기다리는 중…';
// tours.js에 정직 공시가 없을 때 쓰는 글
const NOTES = [
  '모의 데이터입니다. 실제 서버 · 사내 데이터와 연결돼 있지 않습니다.',
  'AI 문장은 준비된 예시입니다.',
  '누른 조작은 이 브라우저 안에서만 반영되고, 새로 고치면 처음으로 돌아갑니다.',
];

// ---- 내용: 빈 값 · 없는 칸이 있어도 죽지 않게 ----
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const intro = INTRO && typeof INTRO === 'object' ? INTRO : {};
const notes = list(intro.notes).length ? list(intro.notes) : NOTES;
const tours = list(TOURS).filter((t) => t.id);
const more = list(MORE).filter((m) => m.hash && m.label);
const stepsOf = (t) => list(t && t.steps);
const tourById = (id) => tours.find((t) => t.id === id) || null;

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
  console.warn('[가이드]', what, err && err.message ? err.message : err);
}

// ---- 끝낸 투어 기억(✓) ----
function loadDone() {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch (e) { return new Set(); }
}
const done = loadDone();
function saveDone() {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done])); } catch (e) { /* 편의 기능 */ }
}

// ---- 상태 ----
// mode: 'home'(처음) | 'step'(단계) | 'done'(끝). idx: 단계 번호(0부터), 처음 -1, 끝 = 단계 수
const st = {
  mode: 'home', tour: null, idx: -1, adv: { kind: 'next' },
  collapsed: false, side: 'right',
  found: false, lost: false, missAt: 0, scrolled: false, filled: false,
  off: false, offAt: 0, pulls: 0, userMoved: false, // 목표가 있는데 화면 밖
  manual: false,          // 되돌아온 조건 단계: 조건이 이미 맞아 있어 '다음'으로 넘긴다
  goDone: true, goAt: 0,
  seen: [],               // 단계별로 목표를 마지막으로 본 주소(이전 · 길 잃음 복구에 쓴다)
};
let layer, card, kick, prog, body, hint, foot, pill, ring, chip, chipBtn;
const curStep = () => (st.mode === 'step' ? stepsOf(st.tour)[st.idx] || null : null);

// ---- 주소 ----
const dec = (h) => { try { return decodeURIComponent(h); } catch (e) { return h; } };
const normHash = (h) => { const s = dec(String(h || '')); return s === '' || s === '#' ? '#dashboard' : s; };
const sameHash = (h) => normHash(location.hash) === normHash(h);
// go가 가리키는 화면에 이미 있는가. go에 쿼리가 없으면 경로만 본다(화면이 스스로 붙인 쿼리는 같은 화면).
function sameScreen(go) {
  const cur = normHash(location.hash), want = normHash(go);
  return want.includes('?') ? cur === want : cur.split('?')[0] === want;
}
function hashIs(re) {
  const raw = location.hash || '';
  if (re instanceof RegExp) {
    re.lastIndex = 0;
    if (re.test(raw)) return true;
    re.lastIndex = 0;
    return re.test(dec(raw));
  }
  return sameHash(re);
}
function goOf(s) {
  try {
    const g = s && typeof s.go === 'function' ? s.go() : s && s.go;
    return g ? String(g) : '';
  } catch (e) { warnOnce('go()', e); return ''; }
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
function findTarget(s) {
  const t = s && s.target;
  if (!t) return null;
  if (typeof t === 'function') {
    try { const e = t(document); return shown(e) ? e : null; } catch (err) { warnOnce('target()', err); return null; }
  }
  return firstShown(String(t));
}
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
  x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, innerWidth); y2 = Math.min(y2, floorY());
  return x2 - x1 >= 1 && y2 - y1 >= 1 ? { x1, y1, x2, y2 } : null;
}

// 넘어가는 조건 → {kind: 'next' | 'click' | 'cond', test}
function advOf(s) {
  const a = s && s.advance;
  if (a === 'click') return s.target ? { kind: 'click' } : { kind: 'next' };
  if (a && typeof a === 'object') {
    if (a.appear) return { kind: 'cond', test: () => !!firstShown(a.appear) };
    if (a.gone) return { kind: 'cond', test: () => !firstShown(a.gone) };
    if (a.hash) return { kind: 'cond', test: () => hashIs(a.hash) };
    if (typeof a.test === 'function') return { kind: 'cond', test: () => !!a.test(document) };
  }
  return { kind: 'next' };
}
function condOK() {
  try { return st.adv.kind === 'cond' && st.adv.test(); } catch (err) { warnOnce('advance', err); return false; }
}

// ---- 테두리 · 카드 자리 ----
const PAD = 4; // 테두리와 요소 사이
function drawRing(box) {
  if (!box) { ring.hidden = true; return; }
  const x = Math.max(2, box.x1 - PAD), y = Math.max(2, box.y1 - PAD);
  const w = Math.min(innerWidth - 2, box.x2 + PAD) - x, h = Math.min(innerHeight - 2, box.y2 + PAD) - y;
  ring.style.left = `${x}px`; ring.style.top = `${y}px`;
  ring.style.width = `${Math.max(0, w)}px`; ring.style.height = `${Math.max(0, h)}px`;
  ring.hidden = false;
}
// 카드를 둘 쪽: 기본 오른쪽 아래, 단계가 side를 정했으면 그쪽.
// 단계가 쪽을 정하지 않았는데 오른쪽 서랍이 열려 있으면 왼쪽(서랍 안을 가리지 않게).
// 테두리와 겹치면 반대쪽 아래로, 아래 양쪽이 다 겹치면 오른쪽 위로. 셋 다 겹치면 아래 둘 중 덜 가리는 쪽.
function pickSide(box) {
  if (innerWidth <= NARROW) return 'bottom';
  const s = curStep();
  const c = card.getBoundingClientRect();
  let pref = s && (s.side === 'left' || s.side === 'right') ? s.side : '';
  if (!pref) {
    const d = document.querySelector('.drawer');
    const dl = d && shown(d) ? d.getBoundingClientRect().left : innerWidth;
    pref = dl < innerWidth - EDGE && dl > EDGE + (c.width || 360) ? 'left' : 'right';
  }
  if (!box || st.collapsed || !c.width) return pref;
  const gap = PAD + 4;
  // 카드를 (l, t)에 뒀을 때 테두리와 겹치는 넓이
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
  if (!at.top) return 'top';
  return at[opp] < at[pref] * 0.6 ? opp : pref; // 차이가 뚜렷할 때만 옮긴다
}
// 카드를 위에 둘 때의 윗변: 위 막대 바로 아래
function topY() {
  const t = document.getElementById('top');
  return Math.max(0, t ? t.getBoundingClientRect().bottom : 0) + 12;
}
function setSide(side) {
  if (st.side === side) return;
  st.side = side;
  card.classList.toggle('eg-left', side === 'left');
  card.classList.toggle('eg-top', side === 'top');
  card.style.top = side === 'top' ? `${topY()}px` : '';
  document.body.classList.toggle('eg-at-left', side === 'left');
  document.body.classList.toggle('eg-at-top', side === 'top');
  measure();
}
// 카드(접혔으면 알약) 윗변에서 창 아래까지. 토스트 · 좁은 화면 여백이 이 값을 쓴다(css/guide.css).
function measure() {
  const e = st.collapsed ? pill : card;
  const r = e.getBoundingClientRect();
  const up = st.side === 'top' && !st.collapsed; // 위에 있으면 아래를 가리지 않는다
  document.body.style.setProperty('--eg-h', `${r.height && !up ? Math.max(0, Math.round(innerHeight - r.top)) : 0}px`);
}
// 스크롤 · 크기 변화: 자리만 다시 맞춘다
let moveReq = 0;
function onMove() {
  if (moveReq) return;
  moveReq = requestAnimationFrame(() => {
    moveReq = 0;
    const t = findTarget(curStep());
    const box = t ? seenRect(t) : null;
    drawRing(box);
    setSide(pickSide(box));
    measure();
  });
}

// ---- 250ms마다: go · 채우기 · 목표 · 길 잃음 · 조건 ----
function tick() {
  const s = curStep();
  if (!s) { ring.hidden = true; setSide(pickSide(null)); return; }
  const now = Date.now();
  if (!st.goDone) {
    const h = goOf(s);
    if (!h || sameScreen(h)) st.goDone = true;
    else if (now >= st.goAt) { st.goDone = true; location.hash = h; }
  }
  if (s.fill && !st.filled) fill(s.fill);
  const t = findTarget(s);
  if (t) {
    if (!st.scrolled && st.goDone) { st.scrolled = true; show(t); }
    if (st.goDone) st.seen[st.idx] = location.hash;
    st.missAt = 0;
  } else if (s.target) {
    if (!st.missAt) st.missAt = now;
  } else if (st.goDone && st.seen[st.idx] == null) st.seen[st.idx] = location.hash;
  let box = t ? seenRect(t) : null;
  // 있는데 잘렸거나 화면 밖: 화면이 스스로 밀어낸 것이면(사용자가 굴리지 않았으면) 다시 가운데로 끌어온다.
  // 그래도 화면 밖이면 조금 뒤 '표시된 곳으로' 단추를 낸다.
  if (t && st.scrolled && !st.userMoved && st.pulls < PULLS && cut(t, box)) { st.pulls++; show(t); box = seenRect(t); }
  if (t && !box && st.scrolled) { if (!st.offAt) st.offAt = now; } else st.offAt = 0;
  drawRing(box);
  setSide(pickSide(box));
  st.found = !!t;
  const lost = !!s.target && !t && now - st.missAt > LOST_MS;
  const off = !!st.offAt && now - st.offAt > OFF_MS;
  if (lost !== st.lost || off !== st.off) { st.lost = lost; st.off = off; drawHint(); }
  if (st.adv.kind === 'cond') {
    const ok = condOK();
    if (st.manual) { if (!ok) { st.manual = false; drawHint(); drawFoot(); } }
    else if (ok) enter(st.idx + 1, 'auto');
  }
}
// 좁은 화면에서는 카드가 아래를 다 덮으므로 카드 윗변까지만 보이는 것으로 친다
function floorY() {
  const top = innerWidth <= NARROW && card && !st.collapsed ? card.getBoundingClientRect().top : 0;
  return top || innerHeight;
}
// 목표가 잘려 보이는가: 다 들어갈 크기인데 위아래가 가렸다. 통째로 화면 밖이어도 참.
function cut(t, box) {
  if (!box) return true;
  const h = t.getBoundingClientRect().height;
  return box.y2 - box.y1 < h - 2 && h <= floorY() - topY();
}
function show(t) {
  try { t.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* 무시 */ }
}
// 사용자가 스스로 화면을 굴리거나 누르면 그 뒤로는 목표를 억지로 끌어오지 않는다
function onUserMove(ev) {
  const t = ev.target;
  if (t && t.closest && t.closest('.eg')) return;
  st.userMoved = true;
}
// 단계에 들어와 그 요소가 보이면 값을 채우고 input 이벤트를 낸다(한 번)
function fill(f) {
  const e = f && f.selector ? firstShown(f.selector) : null;
  if (!e) return;
  st.filled = true;
  const v = String(f.value ?? '');
  if (e.value === v) return;
  e.value = v;
  e.dispatchEvent(new Event('input', { bubbles: true }));
}
// 누르기: capture 단계에서 본다. 화면이 그 클릭을 다 처리한 뒤에 넘어간다.
function onDocClick(ev) {
  if (st.mode !== 'step' || st.adv.kind !== 'click') return;
  const t = ev.target;
  if (!t || !t.closest || t.closest('.eg, .eg-pill, .eg-chip')) return;
  const s = curStep();
  let hit = false;
  try {
    if (typeof s.target === 'function') { const e = s.target(document); hit = !!e && e.contains(t); }
    else hit = !!t.closest(String(s.target));
  } catch (err) { warnOnce('target', err); }
  if (!hit) return;
  const tour = st.tour, at = st.idx;
  setTimeout(() => { if (st.mode === 'step' && st.tour === tour && st.idx === at) enter(at + 1, 'auto'); }, 0);
}

// ---- 이동 ----
// how: 'start' | 'next'(단추) | 'auto'(누르기 · 조건) | 'back'(이전) | 'jump'(복구 · 검사)
function enter(i, how) {
  if (!st.tour) return;
  const steps = stepsOf(st.tour);
  if (i >= steps.length) { finish(); return; }
  st.mode = 'step';
  st.idx = Math.max(0, i);
  const s = steps[st.idx];
  st.adv = advOf(s);
  st.found = false; st.lost = false; st.scrolled = false; st.filled = false;
  st.off = false; st.offAt = 0; st.pulls = 0; st.userMoved = false;
  st.missAt = Date.now();
  st.goDone = false;
  st.goAt = Date.now() + (how === 'auto' ? GO_WAIT : 0);
  // 되돌아오거나 건너온 조건 단계는 조건이 이미 맞아 있어도 곧바로 지나치지 않는다('다음'으로 넘긴다)
  st.manual = (how === 'back' || how === 'jump') && condOK();
  // go가 없는 단계로 되돌아가면 그 단계를 마지막으로 본 주소로
  if (how === 'back' && !goOf(s) && st.seen[st.idx] && !sameHash(st.seen[st.idx])) location.hash = st.seen[st.idx];
  render();
  tick();
}
function start(id) {
  const t = tourById(id);
  if (!t) return false;
  st.tour = t;
  st.seen = [];
  setCollapsed(false);
  enter(0, 'start');
  return true;
}
function prev() { if (st.mode === 'step' && st.idx > 0) enter(st.idx - 1, 'back'); }
function next() { if (st.mode === 'step') enter(st.idx + 1, 'next'); }
function finish() {
  st.mode = 'done';
  st.idx = stepsOf(st.tour).length;
  st.found = false; st.lost = false; st.off = false;
  done.add(st.tour.id);
  saveDone();
  setCollapsed(false);
  render();
  tick(); // 테두리를 걷고 카드를 제자리로
}
function home() {
  st.mode = 'home'; st.tour = null; st.idx = -1;
  st.found = false; st.lost = false; st.off = false;
  render();
  tick();
}
// 길 잃음 복구로 할 수 있는 일: {hash} 그 주소로 | {step} 그 단계부터 다시 | null(할 수 있는 일 없음)
function wayBack() {
  const s = curStep();
  if (!s) return null;
  const own = goOf(s);
  if (own && !sameScreen(own)) return { hash: own };
  const seen = st.seen[st.idx];
  if (seen && !sameHash(seen)) return { hash: seen };
  // 같은 화면인데 안 보인다(서랍 · 창이 닫힘): 그것을 여는 앞 단계(누르기 · 조건) 가운데 지금 목표가 보이는 것부터 다시
  const steps = stepsOf(st.tour);
  for (let j = st.idx - 1; j >= 0; j--) {
    if (steps[j].target && advOf(steps[j]).kind !== 'next' && findTarget(steps[j])) return { step: j };
  }
  return null;
}
function recover() {
  const w = wayBack();
  st.missAt = Date.now(); st.lost = false;
  drawHint();
  if (!w) return;
  if (w.hash) location.hash = w.hash;
  else enter(w.step, 'jump');
}
// 화면 밖으로 밀린 목표를 다시 가운데로
function bringBack() {
  const t = findTarget(curStep());
  st.userMoved = false; st.pulls = 0; st.offAt = 0; st.off = false;
  drawHint();
  if (t) show(t);
  tick();
}
function setCollapsed(v) {
  st.collapsed = !!v;
  if (!card) return;
  card.hidden = st.collapsed;
  pill.hidden = !st.collapsed;
  if (chipBtn) chipBtn.setAttribute('aria-expanded', String(!st.collapsed));
  measure();
}

// ---- 그리기 ----
function render() {
  const hadFocus = card.contains(document.activeElement);
  const n = stepsOf(st.tour).length;
  const name = st.tour ? st.tour.title || st.tour.id : '';
  card.classList.toggle('eg-home', st.mode === 'home');
  if (st.mode === 'home') {
    kick.replaceChildren('체험 가이드');
    pill.textContent = '체험 가이드';
    prog.hidden = true;
    body.replaceChildren(...homeBody());
  } else {
    const at = st.mode === 'done' ? '끝' : `${st.idx + 1}/${n}`;
    kick.replaceChildren(el('b', { text: name }), ` · ${at}`);
    pill.textContent = `체험 가이드 · ${at}`;
    prog.hidden = false;
    prog.firstChild.style.width = `${st.mode === 'done' || !n ? 100 : Math.round(((st.idx + 1) / n) * 100)}%`;
    body.replaceChildren(...(st.mode === 'done' ? doneBody() : stepBody(curStep())));
  }
  body.scrollTop = 0;
  drawHint();
  drawFoot();
  if (hadFocus) (foot.querySelector('.pri') || card).focus(); // 키보드로 넘겼으면 포커스를 카드 안에 둔다
  measure();
}
function homeBody() {
  const kids = [el('h2', { class: 'eg-t', text: intro.title || '이음 체험판' })];
  if (intro.lead) kids.push(el('p', { class: 'eg-p', text: intro.lead }));
  kids.push(el('ul', { class: 'eg-notes' }, notes.map((t) => el('li', { text: t }))));
  if (tours.length) kids.push(el('ol', { class: 'eg-tours' }, tours.map(tourItem)));
  if (more.length) {
    kids.push(el('div', { class: 'eg-more' },
      el('span', { class: 'eg-moreh', text: '더 둘러보기' }),
      more.map((m) => el('a', { href: m.hash, title: m.desc || null, text: m.label }))));
  }
  return kids;
}
function tourItem(t, i) {
  const ok = done.has(t.id);
  const meta = [t.minutes ? `${t.minutes}분` : '', t.who || ''].filter(Boolean).join(' · ');
  return el('li', {},
    el('button', { type: 'button', class: `eg-tour${t.featured ? ' feat' : ''}${ok ? ' ok' : ''}`, onclick: () => start(t.id) },
      el('span', { class: 'eg-no', 'aria-hidden': 'true', text: ok ? '✓' : String(i + 1) }),
      el('span', { class: 'eg-tt' },
        el('b', { text: t.title || t.id }),
        t.featured ? el('span', { class: 'eg-tag', text: '추천' }) : null,
        ok ? el('span', { class: 'eg-sr', text: '끝냄' }) : null,
        meta ? el('span', { class: 'eg-meta', text: meta }) : null),
      t.summary ? el('span', { class: 'eg-sum', text: t.summary }) : null));
}
function stepBody(s) {
  const kids = [el('h3', { class: 'eg-t', text: (s && s.title) || '' })];
  if (s && s.body) kids.push(el('p', { class: 'eg-p', text: s.body }));
  const terms = list(s && s.terms).filter((t) => Array.isArray(t) && t[0]);
  if (terms.length) {
    kids.push(el('dl', { class: 'eg-terms' }, terms.map((t) => el('div', {}, el('dt', { text: t[0] }), el('dd', { text: t[1] ?? '' })))));
  }
  kids.push(hint);
  return kids;
}
function doneBody() {
  const d = (st.tour && st.tour.done) || {};
  const kids = [el('h3', { class: 'eg-t' }, el('span', { class: 'eg-okm', 'aria-hidden': 'true', text: '✓' }), d.title || '투어를 마쳤습니다')];
  if (d.body) kids.push(el('p', { class: 'eg-p', text: d.body }));
  const links = list(d.links).filter((l) => l.hash && l.label);
  if (links.length) kids.push(el('div', { class: 'eg-links' }, links.map((l) => el('a', { href: l.hash, text: l.label }))));
  return kids;
}
// 끝 화면의 '다음 투어': done.next, 없으면 목록에서 아직 안 끝낸 다음 것
function nextTour() {
  const d = (st.tour && st.tour.done) || {};
  const t = d.next ? tourById(d.next) : null;
  if (t) return t;
  const at = tours.indexOf(st.tour);
  return tours.slice(at + 1).concat(tours.slice(0, Math.max(0, at))).find((x) => !done.has(x.id)) || null;
}
// 안내 줄(눌러 보세요 · 기다리는 중)과 길 잃음 줄. 단계 글 안에 있어 바뀌면 읽어 준다.
function drawHint() {
  hint.replaceChildren();
  const s = curStep();
  if (!s) return;
  const k = st.adv.kind;
  if (k === 'click') hint.append(el('div', { class: 'eg-hint act' }, el('i', { class: 'eg-dot', 'aria-hidden': 'true' }), s.waitHint || HINT_CLICK));
  else if (k === 'cond' && !st.manual) hint.append(el('div', { class: 'eg-hint wait' }, el('i', { class: 'eg-spin', 'aria-hidden': 'true' }), s.waitHint || HINT_WAIT));
  if (st.lost) {
    // 돌아갈 길이 없으면(이 화면 크기에서는 안 보이는 곳 등) 말만 한다
    hint.append(el('div', { class: 'eg-lost' },
      el('span', { text: '표시할 곳이 지금 화면에 없습니다' }),
      wayBack() ? el('button', { type: 'button', class: 'eg-btn', text: '이 단계 화면으로', onclick: recover }) : null));
  } else if (st.off) {
    hint.append(el('div', { class: 'eg-lost' },
      el('span', { text: '표시된 곳이 화면 밖에 있습니다' }),
      el('button', { type: 'button', class: 'eg-btn', text: '표시된 곳으로', onclick: bringBack })));
  }
}
function drawFoot() {
  foot.replaceChildren();
  foot.hidden = st.mode === 'home';
  if (st.mode === 'step') {
    const last = st.idx >= stepsOf(st.tour).length - 1;
    const byButton = st.adv.kind === 'next' || st.manual;
    foot.append(
      el('button', { type: 'button', class: 'eg-btn', text: '이전', disabled: st.idx <= 0, onclick: prev }),
      byButton
        ? el('button', { type: 'button', class: 'eg-btn pri', text: last ? '마치기' : '다음', onclick: next })
        : el('button', { type: 'button', class: 'eg-btn', text: '건너뛰기', title: '이 단계를 하지 않고 다음으로', onclick: next }),
      el('span', { class: 'eg-grow' }),
      el('button', { type: 'button', class: 'eg-btn quiet', text: '그만두기', onclick: home }));
  } else if (st.mode === 'done') {
    const t = nextTour();
    foot.append(
      t ? el('button', { type: 'button', class: 'eg-btn pri', text: `다음: ${t.title || t.id}`, onclick: () => start(t.id) }) : null,
      el('span', { class: 'eg-grow' }),
      el('button', { type: 'button', class: `eg-btn${t ? ' quiet' : ' pri'}`, text: '처음으로', onclick: home }));
  }
}

// ---- 붙이기 ----
function build() {
  kick = el('span', { class: 'eg-k' });
  prog = el('div', { class: 'eg-prog', hidden: true }, el('i'));
  body = el('div', { class: 'eg-b', 'aria-live': 'polite' });
  hint = el('div', { class: 'eg-hints' });
  foot = el('div', { class: 'eg-f', hidden: true });
  card = el('section', { class: 'eg eg-home', id: 'guide', role: 'region', 'aria-label': '체험 가이드', tabindex: '-1' },
    el('div', { class: 'eg-h' }, kick,
      el('button', { type: 'button', class: 'eg-x', title: '접기', 'aria-label': '가이드 접기', text: '▾', onclick: () => setCollapsed(true) })),
    prog, body, foot);
  pill = el('button', { type: 'button', class: 'eg-pill', hidden: true, title: '체험 가이드 펼치기', onclick: () => setCollapsed(false) });
  ring = el('div', { class: 'eg-ring', hidden: true, 'aria-hidden': 'true' });
  // 모양(css/guide.css)이 올 때까지 숨겨 둔다
  layer = el('div', { class: 'eg-layer', hidden: true }, ring, card, pill);
  document.body.append(layer);
  // 위 막대 로고 옆 칩: 누르면 카드 열고 닫기, ⓘ에 정직 공시
  const logo = document.querySelector('#top .logo');
  if (logo) {
    chipBtn = el('button', { type: 'button', class: 'eg-chipb', 'aria-controls': 'guide', 'aria-expanded': 'true', title: '체험 가이드 열기 · 닫기', text: '체험판', onclick: () => setCollapsed(!st.collapsed) });
    chip = el('span', { class: 'eg-chip', hidden: true }, chipBtn,
      el('span', { class: 'tip', tabindex: '0', 'aria-label': '체험판 안내' }, 'ⓘ',
        el('span', { class: 'tipbox' }, notes.map((t) => el('span', { class: 'eg-tipl', text: t })))));
    logo.after(chip);
  }
}
function addCss(onReady) {
  let fired = false;
  const ready = () => { if (!fired) { fired = true; onReady(); } };
  const link = el('link', { rel: 'stylesheet', href: new URL('../css/guide.css', import.meta.url).href, onload: ready, onerror: ready });
  document.head.append(link);
  setTimeout(ready, 3000);
}

let started = false;
export function startGuide() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.body.classList.add('demo');
  document.title = '이음 체험판';
  build();
  render();
  addCss(() => {
    layer.hidden = false;
    if (chip) chip.hidden = false;
    measure();
    tick();
  });
  document.addEventListener('click', onDocClick, true);
  for (const ev of ['wheel', 'touchmove', 'keydown', 'mousedown']) window.addEventListener(ev, onUserMove, { capture: true, passive: true });
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  window.addEventListener('hashchange', () => setTimeout(tick, 0));
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(measure);
    ro.observe(card); ro.observe(pill);
  }
  setInterval(tick, TICK);
  // 검사용 손잡이(자동 확인 스크립트가 쓴다). step은 0부터, 처음 -1, 끝 = steps.
  window.__eumGuide = {
    tours,
    state: () => ({
      tour: st.tour ? st.tour.id : null, step: st.idx, steps: stepsOf(st.tour).length,
      targetFound: !!findTarget(curStep()), cardSide: st.side, collapsed: st.collapsed,
      mode: st.mode, lost: st.lost,
    }),
    start,
    go: (i) => { if (st.tour) enter(Number(i) || 0, 'jump'); },
    next, home,
  };
}
