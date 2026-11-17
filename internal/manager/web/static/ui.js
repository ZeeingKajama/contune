// 공통 부품. 형식·계산 함수는 DOM 없이 호출된다.
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// 주소 조각(경로·쿼리 값) 이스케이프
export const enc = encodeURIComponent;

// ---- 순수 형식 함수 ----
export const DASH = '—';
export function fmtNum(v, digits) {
  if (v == null || Number.isNaN(Number(v))) return DASH;
  const n = Number(v);
  const d = digits ?? (Number.isInteger(n) || Math.abs(n) >= 1000 ? 0 : (Math.abs(n) >= 100 ? 0 : 1));
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
// 값 + 작은 글자 단위 → HTML 문자열
export function numUnit(v, unit, digits) {
  const s = fmtNum(v, digits);
  if (s === DASH) return DASH;
  return `<span class="num">${esc(s)}</span>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}`;
}
export function relTime(ts, now = Date.now()) {
  if (!ts) return DASH;
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
export function fmtDuration(ms) {
  if (ms == null || ms < 0) return DASH;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}
export const p2 = (n) => String(n).padStart(2, '0');
export function fmtClock(ts) {
  const d = new Date(ts);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
// 표·목록의 날짜: MM-DD HH:MM, sec면 MM-DD HH:MM:SS. 값이 없으면 —
export function fmtDT(ts, { sec } = {}) {
  if (!ts) return DASH;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return DASH;
  const s = `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return sec ? `${s}:${p2(d.getSeconds())}` : s;
}

// ---- 오류 글 ----
// ApiError 모양(숫자 status + error)으로 본다. ui.js는 api.js를 import하지 않는다(DOM 없는 형식 함수도 여기 있다).
const statusOf = (e) => (e && typeof e === 'object' && typeof e.status === 'number' ? e.status : null);
// 원문: ApiError면 e.error(없으면 '오류 <status>', 상태 0이면 '서버 응답 없음'), 아니면 메시지
export function errText(e) {
  const s = statusOf(e);
  if (s != null && 'error' in e) return e.error ? String(e.error) : s === 0 ? '서버 응답 없음' : `오류 ${s}`;
  if (s === 0) return '서버 응답 없음';
  return String(e?.message ?? e);
}
// 사람이 읽을 까닭
export function errReason(e) {
  const s = statusOf(e);
  if (s === 0) return '서버 응답 없음';
  if (s === 401) return '로그인이 끝남';
  if (s === 403) return '권한 없음';
  if (s === 404) return '없음';
  if (s != null && s >= 500) return `서버 오류(${s})`;
  return errText(e);
}

// 실행 번호 줄임: 뒤 6자. ULID는 같은 밀리초에 만들면 끝자리만 늘어나므로 앞이 아니라 뒤를 본다.
// 시드 ID(eum seed)처럼 끝이 0으로 채워져 있으면 0을 떼고 뒤 6자.
export function shortExec(id) {
  const s = String(id ?? '');
  return (s.replace(/0+$/, '') || s).slice(-6);
}

// 등급 이름(서버 상태·알림 등급). 모든 화면이 이것을 쓴다.
export const LEVEL_TEXT = { ok: '정상', warn: '경고', crit: '위험', silent: '무응답' };
// 상태 배지: 색 + 글자(항상 글자와 함께)
const STATE_TEXT = {
  ok: [LEVEL_TEXT.ok, '●'], warn: [LEVEL_TEXT.warn, '▲'], crit: [LEVEL_TEXT.crit, '■'], silent: [LEVEL_TEXT.silent, '○'],
  SUCCEEDED: ['성공', '✓'], FAILED: ['실패', '✕'], RUNNING: ['실행 중', '▶'], WAITING: ['대기', '…'],
  GATED: ['조건 대기', '⏸'], FORCED: ['강제 OK', '✓'], KILLED: ['강제 종료', '✕'], SCHEDULED: ['예정', '◷'],
  TIMEOUT: ['시간 초과', '✕'], HELD: ['보류', '⏸'], LOST: ['유실', '✕'], DISPATCHED: ['대기', '…'],
};
export function badgeHTML(state, text) {
  const t = STATE_TEXT[state] || [String(state), '•'];
  return `<span class="badge ${esc(String(state).toLowerCase())}">${t[1]} ${esc(text ?? t[0])}</span>`;
}
export function badge(state, text) {
  const s = document.createElement('span');
  s.innerHTML = badgeHTML(state, text);
  return s.firstChild;
}

// 빈 상태 문구
export const EMPTY = { none: DASH, notCollected: '미수집', serviceDown: '서비스 미기동' };

// ---- DOM 부품 ----
let uidSeq = 0;
const uid = (p) => `${p}-${++uidSeq}`;

// 토스트: toast(글) · toast(글, ms) · toast(글, {level:'info'|'ok'|'error', ms, action:{text, href|onclick}}) → 닫기 함수
// error는 닫을 때까지 머문다. 한 번에 4개까지(넘치면 오래된 info → ok → error 순으로 지운다). 같은 글이 떠 있으면 쌓지 않는다.
const TOAST_MAX = 4;
const TOAST_MARK = { ok: '✓', error: '!' };
const toastMeta = new WeakMap(); // 토스트 → {text, level, timer}
export function toast(msg, opts) {
  const box = document.getElementById('toasts');
  if (!box) return () => {};
  const o = typeof opts === 'number' ? { ms: opts } : (opts || {});
  const level = o.level === 'ok' || o.level === 'error' ? o.level : 'info';
  const text = String(msg ?? '');
  const ms = o.ms ?? 2500;
  const close = (t) => { const m = toastMeta.get(t); if (m) clearTimeout(m.timer); t.remove(); };
  const arm = (t) => {
    const m = toastMeta.get(t);
    clearTimeout(m.timer);
    if (m.level !== 'error') m.timer = setTimeout(() => t.remove(), ms);
  };
  const same = [...box.children].find((t) => toastMeta.get(t)?.text === text);
  if (same) { arm(same); return () => close(same); }
  const t = el('div', { class: level === 'info' ? 'toast' : `toast ${level}`, role: level === 'error' ? 'alert' : null });
  toastMeta.set(t, { text, level, timer: 0 });
  if (TOAST_MARK[level]) t.append(el('span', { class: 'toast-mark', 'aria-hidden': 'true', text: TOAST_MARK[level] }));
  t.append(el('span', { class: 'toast-msg', text }));
  const a = o.action;
  if (a && a.text) {
    t.append(a.href
      ? el('a', { class: 'toast-act', href: a.href, text: a.text, onclick: () => close(t) })
      : el('button', { type: 'button', class: 'toast-act', text: a.text, onclick: () => { close(t); if (a.onclick) a.onclick(); } }));
  }
  if (level === 'error') t.append(el('button', { type: 'button', class: 'toast-x', 'aria-label': '닫기', title: '닫기', text: '✕', onclick: () => close(t) }));
  box.append(t);
  arm(t);
  while (box.children.length > TOAST_MAX) {
    const olds = [...box.children].filter((x) => x !== t);
    const drop = ['info', 'ok', 'error'].map((lv) => olds.find((x) => (toastMeta.get(x)?.level ?? 'info') === lv)).find(Boolean) || olds[0];
    if (!drop) break;
    close(drop);
  }
  return () => close(t);
}
// 실패 토스트: '<무엇> · <까닭>'
export function toastError(what, e) {
  return toast(`${what} · ${errReason(e)}`, { level: 'error' });
}

// 불러오는 중 · 없음 · 실패 칸: stateBox(kind, {text, e, detail, retry, action:{text, href|onclick}}) → 요소
// error는 까닭(errReason) 줄, detail(누가 뭘 하면 풀리는지), 다시 시도·고치는 단추, 원문(errText)은 접어 둔다.
const STATE_DEFAULT = { loading: '불러오는 중…', empty: '없음', error: '불러오지 못함' };
export function stateBox(kind, opts = {}) {
  const k = STATE_DEFAULT[kind] ? kind : 'loading';
  const o = opts || {};
  const box = el('div', { class: `state state-${k}`, role: k === 'error' ? 'alert' : null });
  box.append(el('div', { class: 'state-text', text: o.text ?? STATE_DEFAULT[k] }));
  const why = k === 'error' && o.e != null ? errReason(o.e) : '';
  if (why) box.append(el('div', { class: 'state-why', text: why }));
  if (o.detail) box.append(el('div', { class: 'state-detail' }, o.detail));
  const btns = [];
  if (o.retry) {
    const b = el('button', { type: 'button', text: '다시 시도' });
    b.addEventListener('click', () => act(b, o.retry, { fail: '다시 시도하지 못함' }));
    btns.push(b);
  }
  const a = o.action;
  if (a && a.text) btns.push(a.href ? el('a', { class: 'state-act', href: a.href, text: a.text }) : el('button', { type: 'button', text: a.text, onclick: a.onclick }));
  if (btns.length) box.append(el('div', { class: 'state-btns' }, btns));
  if (k === 'error' && o.e != null) {
    const raw = errText(o.e);
    if (raw && raw !== why) box.append(el('details', { class: 'state-raw' }, el('summary', { text: '원문' }), el('pre', { text: raw })));
  }
  return box;
}

// 단추 동작: 잠그고 fn()을 기다린 뒤 성공이면 opts.ok 토스트, 실패면 toastError(opts.fail ?? '하지 못함'). → Promise<boolean>
export async function act(btn, fn, opts = {}) {
  if (btn && btn.getAttribute('aria-busy') === 'true') return false;
  const was = btn ? btn.disabled : false;
  if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try {
    await fn();
    if (opts.ok) toast(opts.ok, { level: 'ok' });
    return true;
  } catch (e) {
    toastError(opts.fail ?? '하지 못함', e);
    return false;
  } finally {
    if (btn) { btn.disabled = was; btn.removeAttribute('aria-busy'); }
  }
}

// ---- 포커스 가두기 ----
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
const focusables = (node) => [...node.querySelectorAll(FOCUSABLE)].filter((x) => x.tabIndex >= 0 && x.getClientRects().length > 0);
const traps = []; // 열린 차례. 맨 뒤(가장 위)만 키를 받는다
function onDocKey(e) {
  // 포커스가 가장 위 칸 밖에 있을 때(배경을 누른 뒤 등). 안에 있으면 칸의 리스너가 맡는다
  const top = traps[traps.length - 1];
  if (!top || top.node.contains(e.target) || e.isComposing) return;
  if (e.key === 'Tab') { e.preventDefault(); (focusables(top.node)[0] || top.node).focus(); }
  else if (e.key === 'Escape' && top.onEscape) { e.preventDefault(); e.stopPropagation(); top.onEscape(e); }
}
// 손으로 만든 모달용: Tab 가두기 + Esc 콜백 + 해제 때 열기 전 포커스로 복귀. → 해제 함수
// 포커스 대상은 Tab을 누를 때마다 다시 센다(안의 내용이 주기마다 다시 그려져도 된다).
// 마지막으로 포커스를 받은 요소. 연 단추가 열기 직전에 다시 그려져 포커스가 body로 빠졌을 때 돌아갈 곳을 찾는 데 쓴다
let lastFocus = null;
if (typeof document !== 'undefined') document.addEventListener('focusin', (e) => { lastFocus = e.target; }, true);
export function trapFocus(node, { onEscape } = {}) {
  let prev = document.activeElement;
  if ((!prev || prev === document.body) && lastFocus && !lastFocus.isConnected) prev = lastFocus;
  // 연 단추가 주기 갱신으로 다시 그려져도 돌아갈 수 있게 data-fk 자리를 적어 둔다
  const holder = prev && prev.closest ? prev.closest('[data-fk]') : null;
  const back = holder ? { key: holder.dataset.fk, idx: fkList(holder, null).indexOf(prev) } : null;
  const sig = prev && prev !== document.body && prev.tagName ? { tag: prev.tagName, cls: prev.getAttribute('class') || '', text: (prev.textContent || '').trim() } : null;
  // 돌아갈 곳: 그대로 있으면 prev, 다시 그려져 떨어져 나갔으면 같은 data-fk 자리, 없으면 모양·글이 같은 요소가 하나뿐일 때만 그것
  const findPrev = () => {
    if (prev.isConnected) return prev;
    if (back && back.idx >= 0) {
      const h = [...document.querySelectorAll('[data-fk]')].find((x) => x.dataset.fk === back.key);
      const t = h && fkList(h, null)[back.idx];
      if (t) return t;
    }
    if (!sig || !sig.text) return null;
    const same = [...document.querySelectorAll(sig.tag)].filter((x) => (x.getAttribute('class') || '') === sig.cls && !node.contains(x) && x.textContent.trim() === sig.text);
    return same.length === 1 ? same[0] : null;
  };
  const me = { node, onEscape };
  traps.push(me);
  if (traps.length === 1) document.addEventListener('keydown', onDocKey, true);
  const onKey = (e) => {
    if (traps[traps.length - 1] !== me || e.isComposing) return;
    if (e.key === 'Escape') {
      if (!me.onEscape) return;
      e.preventDefault(); e.stopPropagation(); me.onEscape(e);
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables(node);
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey ? i <= 0 : i === -1 || i === f.length - 1) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); }
  };
  node.addEventListener('keydown', onKey);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    node.removeEventListener('keydown', onKey);
    const i = traps.indexOf(me);
    if (i >= 0) traps.splice(i, 1);
    if (!traps.length) document.removeEventListener('keydown', onDocKey, true);
    // 사용자가 다른 곳으로 옮긴 포커스는 뺏지 않는다
    const cur = document.activeElement;
    const lost = !cur || cur === document.body || !cur.isConnected || node.contains(cur);
    if (!lost || !prev || prev === document.body || typeof prev.focus !== 'function') return;
    const t = findPrev();
    if (t) t.focus({ preventScroll: true });
    // 닫힘을 보고 화면이 곧바로 다시 그리면(서랍 감시 등) 한 박자 뒤에 한 번 더 찾는다
    setTimeout(() => {
      const c = document.activeElement;
      if (c && c !== document.body && c.isConnected) return;
      const t2 = findPrev();
      if (t2) t2.focus({ preventScroll: true });
    }, 0);
  };
}

// 서랍: openDrawer(titleText) → {body, close}. Esc·✕·배경으로 닫히고, 닫으면 열기 전 포커스로 돌아간다.
let drawerOff = null;
export function openDrawer(title) {
  closeDrawer();
  const bg = el('div', { id: 'drawer-bg', onclick: closeDrawer });
  const body = el('div', { class: 'drawer-body' });
  const d = el('aside', { class: 'drawer', id: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '서랍', tabindex: '-1' },
    el('div', { style: 'display:flex;align-items:center;margin-bottom:8px' },
      el('b', { text: title || '', style: 'flex:1' }),
      el('button', { type: 'button', text: '✕', 'aria-label': '닫기', title: '닫기', onclick: closeDrawer })),
    body);
  document.body.append(bg, d);
  drawerOff = trapFocus(d, { onEscape: closeDrawer });
  d.focus({ preventScroll: true });
  requestAnimationFrame(() => d.classList.add('open'));
  return { body, close: closeDrawer };
}
export function closeDrawer() {
  const off = drawerOff;
  drawerOff = null;
  if (off) off();
  document.getElementById('drawer-bg')?.remove();
  document.getElementById('drawer')?.remove();
}

// 확인 창: confirmBox({title, message, reason:true, reasonLabel, okText, danger}) → Promise<{ok, reason}>
// Esc=취소, 사유 칸에서 Enter=확인. danger면 확인 단추가 .danger이고 첫 포커스는 취소.
export function confirmBox(opts = {}) {
  return new Promise((resolve) => {
    const tid = uid('cb');
    const input = opts.reason ? el('input', { type: 'text', placeholder: opts.reasonLabel || '사유', 'aria-label': opts.reasonLabel || '사유' }) : null;
    let off = null, settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      if (off) off();
      bg.remove();
      resolve({ ok, reason: input ? input.value.trim() : '' });
    };
    const ok = el('button', { type: 'button', class: opts.danger ? 'danger' : '', text: opts.okText || '확인', onclick: () => done(true) });
    const cancel = el('button', { type: 'button', text: '취소', onclick: () => done(false) });
    const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid },
      el('b', { id: tid, text: opts.title || '' }),
      opts.message ? el('div', { text: opts.message, style: 'margin-top:6px' }) : null,
      input,
      el('div', { class: 'btns' }, cancel, ok));
    const bg = el('div', { class: 'modal-bg' }, modal);
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); done(true); } });
    document.body.append(bg);
    off = trapFocus(modal, { onEscape: () => done(false) });
    (opts.danger ? cancel : input || ok).focus();
  });
}

// 나가기 확인: isDirty()가 true인 동안 새로 고침·닫기와 화면 안 링크(#…) 이동을 막고 confirmBox로 묻는다. → 해제 함수
export function leaveGuard(isDirty, msg = '저장하지 않은 변경이 있습니다.') {
  let alive = true;
  const onBefore = (e) => { if (alive && isDirty()) { e.preventDefault(); e.returnValue = ''; } };
  const onLink = async (e) => {
    if (!alive || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#' || !isDirty()) return;
    e.preventDefault();
    e.stopPropagation();
    if ((await confirmBox({ title: '나가기', message: msg, okText: '나가기' })).ok && alive) location.hash = a.getAttribute('href');
  };
  window.addEventListener('beforeunload', onBefore);
  document.addEventListener('click', onLink, true);
  return () => {
    alive = false;
    window.removeEventListener('beforeunload', onBefore);
    document.removeEventListener('click', onLink, true);
  };
}

// 탭 막대: tabBar(items:[{id,label}], activeId, onSelect) → 요소. ←→·Home·End로 탭 사이를 옮기고 Enter·Space로 고른다.
export function tabBar(items, active, onSelect) {
  const bar = el('div', { class: 'tabs', role: 'tablist' });
  const draw = (cur) => {
    const has = items.some((it) => it.id === cur);
    bar.replaceChildren(...items.map((it, i) => el('button', {
      type: 'button', class: it.id === cur ? 'on' : '', text: it.label, role: 'tab',
      'aria-selected': it.id === cur ? 'true' : 'false', tabindex: it.id === cur || (!has && i === 0) ? '0' : '-1',
      onclick: () => {
        const had = bar.contains(document.activeElement);
        draw(it.id);
        if (had) bar.querySelector('[aria-selected="true"]')?.focus();
        onSelect(it.id);
      },
    })));
  };
  bar.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const bs = [...bar.querySelectorAll('[role="tab"]')];
    const i = bs.indexOf(document.activeElement);
    if (i < 0 || !bs.length) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length;
    bs.forEach((b, j) => { b.tabIndex = j === n ? 0 : -1; });
    bs[n].focus();
  });
  draw(active);
  return bar;
}

// 표 그리기: table({columns:[{key,label,num,render(row)→문자열|Node}], rows, onRow, rowKey, empty})
// onRow가 있으면 줄에 포커스가 가고 Enter·Space로 연다. rowKey(row)는 줄의 data-fk(keepFocus가 포커스를 되찾는 열쇠).
export function table(opts) {
  const { columns, rows, onRow, rowKey, empty } = opts;
  const t = el('table', { class: 'tbl' });
  t.append(el('thead', {}, el('tr', {}, columns.map((c) => el('th', { class: c.num ? 'num' : '', text: c.label, ...(c.title ? { title: c.title } : {}) })))));
  const tb = el('tbody');
  if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: columns.length, class: 'empty', text: empty ?? DASH })));
  for (const r of rows) {
    const tr = el('tr', { class: onRow ? 'click' : '' });
    for (const c of columns) {
      const v = c.render ? c.render(r) : r[c.key];
      const td = el('td', { class: c.num ? 'num' : '' });
      if (v != null && v.nodeType) td.append(v);
      else if (c.html) td.innerHTML = v ?? DASH;
      else td.textContent = v ?? DASH;
      tr.append(td);
    }
    if (rowKey) { const k = rowKey(r); if (k != null) tr.dataset.fk = String(k); }
    if (onRow) {
      tr.tabIndex = 0;
      tr.addEventListener('click', () => onRow(r));
      tr.addEventListener('keydown', (e) => {
        if (e.target !== tr || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onRow(r);
      });
    }
    tb.append(tr);
  }
  t.append(tb);
  return t;
}

// 주기 갱신에서 "바뀔 때만 다시 그리기": data가 store[key]와 같으면 false, 다르면 저장하고 true
export function changed(store, key, data) {
  const s = JSON.stringify(data);
  if (store[key] === s) return false;
  store[key] = s;
  return true;
}

// redraw()를 돌리고 container의 스크롤과 그 안의 포커스를 되살린다.
// 포커스는 closest('[data-fk]')의 값 + 그 안에서 몇 번째 포커스 대상인지로 다시 찾는다. 포커스가 container 밖이면 포커스는 건드리지 않는다.
const fkList = (scopeEl, container) => [...(scopeEl !== container && scopeEl.tabIndex >= 0 ? [scopeEl] : []), ...scopeEl.querySelectorAll(FOCUSABLE)];
export function keepFocus(container, redraw) {
  const top = container ? container.scrollTop : 0;
  const a = document.activeElement;
  let key = null, idx = -1, sel = null;
  if (container && a && a !== container && container.contains(a)) {
    const holder = a.closest('[data-fk]');
    const scopeEl = holder && holder !== container && container.contains(holder) ? holder : container;
    key = scopeEl === container ? null : holder.dataset.fk;
    idx = fkList(scopeEl, container).indexOf(a);
    if (typeof a.selectionStart === 'number') { try { sel = [a.selectionStart, a.selectionEnd, a.value]; } catch (e) { sel = null; } }
  }
  redraw();
  if (!container) return;
  container.scrollTop = top;
  if (idx < 0) return;
  const scopeEl = key == null ? container
    : [...container.querySelectorAll('[data-fk]')].find((x) => x.dataset.fk === key);
  if (!scopeEl) return;
  const target = fkList(scopeEl, container)[idx];
  if (!target || document.activeElement === target) return;
  target.focus({ preventScroll: true });
  if (sel && target.value === sel[2] && typeof target.setSelectionRange === 'function') { try { target.setSelectionRange(sel[0], sel[1]); } catch (e) { /* 무시 */ } }
  container.scrollTop = top;
}

// ⓘ 말풍선: 마우스를 올리거나 키보드로 오면 보이고, 누르면(터치) 열리고 닫힌다. Esc로 닫힘. 오른쪽·아래로 넘치면 뒤집는다.
function placeTip(tip) {
  const box = tip.querySelector('.tipbox');
  if (!box) return;
  tip.classList.remove('tip-l', 'tip-u');
  const r = box.getBoundingClientRect();
  if (!r.width) return;
  const t = tip.getBoundingClientRect();
  if (r.right > window.innerWidth - 4 && t.right - r.width >= 0) tip.classList.add('tip-l');
  if (r.bottom > window.innerHeight - 4 && t.top - r.height >= 0) tip.classList.add('tip-u');
}
export function info(text) {
  const id = uid('tip');
  const tip = el('span', { class: 'tip', tabindex: '0', 'aria-describedby': id }, 'ⓘ', el('span', { class: 'tipbox', role: 'tooltip', id, text }));
  const shown = () => !tip.classList.contains('shut') && (tip.classList.contains('open') || tip.matches(':hover, :focus'));
  // 닫아 둔(shut) 말풍선은 포커스가 떠날 때까지 닫혀 있다. 포커스 없이 마우스만 올렸다면 다시 올릴 때 열린다
  tip.addEventListener('mouseenter', () => { if (document.activeElement !== tip) tip.classList.remove('shut'); placeTip(tip); });
  tip.addEventListener('mouseleave', () => { if (document.activeElement !== tip) tip.classList.remove('shut'); });
  tip.addEventListener('focus', () => placeTip(tip));
  tip.addEventListener('blur', () => tip.classList.remove('open', 'shut'));
  tip.addEventListener('click', (e) => {
    if (e.target.closest('.tipbox')) return;
    if (tip.classList.contains('open')) { tip.classList.remove('open'); tip.classList.add('shut'); }
    else { tip.classList.remove('shut'); tip.classList.add('open'); placeTip(tip); }
  });
  tip.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !shown()) return;
    e.stopPropagation();
    tip.classList.remove('open');
    tip.classList.add('shut');
  });
  return tip;
}

// 기호 단추: aria-label과 title에 label
export function iconBtn(symbol, label, attrs = {}) {
  return el('button', { type: 'button', 'aria-label': label, title: label, ...attrs }, symbol);
}

// 문서 제목: '(n) 화면 · 이음'(n이 0이면 괄호 없음, 화면 이름이 없으면 '이음')
let titleText = '', titleCount = 0;
function drawTitle() {
  if (typeof document === 'undefined') return;
  const base = titleText ? `${titleText} · 이음` : '이음';
  document.title = titleCount > 0 ? `(${titleCount}) ${base}` : base;
}
export function setTitle(text) { titleText = String(text ?? ''); drawTitle(); }
export function setTitleCount(n) { titleCount = Number(n) > 0 ? Number(n) : 0; drawTitle(); }

// 지금 해시의 쿼리에 patch를 합친다(''·null이면 그 키를 뺀다). history.replaceState라 hashchange가 안 난다.
export function setQuery(patch) {
  const raw = location.hash.replace(/^#/, '');
  const i = raw.indexOf('?');
  const path = i < 0 ? raw : raw.slice(0, i);
  const q = new URLSearchParams(i < 0 ? '' : raw.slice(i + 1));
  for (const [k, v] of Object.entries(patch || {})) {
    if (v == null || v === '') q.delete(k);
    else q.set(k, String(v));
  }
  const qs = q.toString();
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${path}${qs ? '?' + qs : ''}`);
}

// 주인 키(06, 카드 P): 서비스 인스턴스의 지표·프로파일은 exec_id 자리에 "svc:<서비스>@<서버>"로 저장된다(model.ServiceOwner).
export function svcOwner(service, host) { return `svc:${service}@${host}`; }
// "svc:<서비스>@<서버>" → {service, host}, 아니면 null. 실행 링크(#run/)를 만들기 전에 거른다.
export function parseOwner(owner) {
  const m = /^svc:(.+)@([^@]+)$/.exec(String(owner || ''));
  return m ? { service: m[1], host: m[2] } : null;
}
