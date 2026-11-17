// 빠른 이동(Ctrl+K, 위 막대의 '찾기' 단추). 서버·플로우·서비스·업무 패널·보드·화면을 이름으로 찾아 옮긴다.
import { api } from './api.js';
import { can } from './auth.js';
import { el, enc, badge, trapFocus } from './ui.js';
import { flowState } from './tree.js';

const RECENT_KEY = 'eum.qj.recent';
const TTL = 30000;
const MAX = 30;

const SCREENS = [
  ['관제', '#dashboard'], ['서버', '#hosts'], ['배치', '#board'], ['업무', '#biz'], ['서비스', '#svcs'], ['보드', '#dashes'],
  ['실행', '#runs'], ['종료 보고서', '#exits'], ['알림', '#alerts'], ['장애 위험도', '#risk'], ['로그 수집', '#collect'],
];

// 나쁜 상태일수록 앞(작은 수)
const RANK = { crit: 0, FAILED: 0, down: 0, silent: 1, warn: 2, RUNNING: 3, SCHEDULED: 4, ok: 5, SUCCEEDED: 5 };
const rankOf = (s) => (s == null ? 6 : (RANK[s] ?? 6));
const isBad = (s) => rankOf(s) <= 2;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 편의 기능일 뿐 */ } },
};

let cache = null, cacheAt = 0, loading = null;

// 목록 API를 한 번에 받아 30초 쓴다. 실패한 것은 빼고 보인다.
async function loadItems() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  if (loading) return loading;
  loading = (async () => {
    const get = (p) => api(p).catch(() => null);
    const [hosts, flows, svcs, panels, boards] = await Promise.all([get('/hosts'), get('/flows'), get('/services'), get('/panels'), get('/dashboards')]);
    const items = [];
    const arr = (r, k) => (Array.isArray(r) ? r : (r && (r[k] || r.items)) || []);
    for (const h of arr(hosts, 'hosts')) items.push({ tag: '서버', name: String(h.id), state: h.state, href: `#host/${enc(h.id)}/overview` });
    for (const f of arr(flows, 'flows')) {
      const path = String(f.board || '').split('/').filter(Boolean).map(enc).join('/');
      items.push({ tag: '플로우', name: String(f.id), sub: f.board || '', state: flowState(f), href: `#board/${path ? path + '/' : ''}${enc(f.id)}` });
    }
    for (const it of arr(svcs, 'services')) {
      const d = it.def || {}, id = d.id || it.id;
      if (!id) continue;
      const title = d.title || id, ins = it.instances || [];
      if (!ins.length) items.push({ tag: '서비스', name: title, sub: id, href: `#svc/${enc(id)}` });
      for (const i of ins) {
        const st = i.state === 'down' ? 'down' : i.state === 'up' ? 'ok' : null;
        items.push({ tag: '서비스', name: title, sub: i.host || '', state: st, stateText: st === 'down' ? '중단' : null, href: `#svc/${enc(id)}${i.host ? '?host=' + enc(i.host) : ''}`, extra: id });
      }
    }
    for (const p of arr(panels, 'panels')) if (p.id) items.push({ tag: '업무', name: p.title || p.id, sub: p.title && p.title !== p.id ? p.id : '', href: `#biz/${enc(p.id)}` });
    for (const b of arr(boards, 'dashboards')) if (b.id) items.push({ tag: '보드', name: b.title || b.id, sub: b.title && b.title !== b.id ? b.id : '', href: `#dash/${enc(b.id)}` });
    const screens = SCREENS.concat(can('admin') ? [['감사 기록', '#audit']] : []);
    for (const [n, h] of screens) items.push({ tag: '화면', name: n, href: h });
    cache = items; cacheAt = Date.now();
    return items;
  })().finally(() => { loading = null; });
  return loading;
}

function search(items, q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out = [];
  for (const it of items) {
    const hay = [it.name, it.sub, it.extra].filter(Boolean).map((x) => String(x).toLowerCase());
    if (!hay.some((h) => h.includes(s))) continue;
    out.push({ it, pre: String(it.name).toLowerCase().startsWith(s) ? 0 : 1 });
  }
  out.sort((a, b) => a.pre - b.pre || rankOf(a.it.state) - rankOf(b.it.state));
  return out.slice(0, MAX).map((x) => x.it);
}

let box = null; // 열려 있는 창 {close}

function open() {
  if (box || document.body.classList.contains('logged-out')) return;
  const opener = document.activeElement;
  const input = el('input', { type: 'search', class: 'qj-in', placeholder: '서버·플로우·서비스·화면', autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'qj-list', 'aria-label': '빠른 이동', enterkeyhint: 'go' });
  const list = el('div', { class: 'qj-list', id: 'qj-list', role: 'listbox', 'aria-label': '결과' });
  const dlg = el('div', { class: 'qj-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': '빠른 이동' }, input, list);
  const back = el('div', { class: 'qj-back' }, dlg);
  document.body.append(back);

  let rows = [], sel = 0, items = null, closed = false;
  const release = trapFocus(dlg, { onEscape: () => close() });

  function close() {
    if (closed) return;
    closed = true; box = null;
    release();
    back.remove();
    if (opener && opener.isConnected && opener.focus) opener.focus();
  }
  function go(it) {
    const recent = store.get(RECENT_KEY, []).filter((r) => r.href !== it.href);
    recent.unshift({ tag: it.tag, name: it.name, sub: it.sub || '', state: it.state || null, href: it.href });
    store.set(RECENT_KEY, recent.slice(0, 5));
    close();
    if (location.hash === it.href) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = it.href;
  }
  function mark() {
    [...list.children].forEach((c, i) => {
      if (!c.classList.contains('qj-row')) return;
      const on = c.dataset.i === String(sel);
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { input.setAttribute('aria-activedescendant', c.id); c.scrollIntoView({ block: 'nearest' }); }
    });
    if (!rows.length) input.removeAttribute('aria-activedescendant');
  }
  function rowEl(it, i) {
    const r = el('div', { class: 'qj-row', id: 'qj-o' + i, role: 'option', 'data-i': String(i), 'aria-selected': 'false' },
      el('span', { class: 'qj-tag', text: it.tag }),
      el('span', { class: 'qj-nm' }, el('span', { text: it.name }), it.sub ? el('span', { class: 'qj-sub', text: it.sub }) : null),
      it.state ? badge(it.state, it.stateText) : null);
    r.addEventListener('mousedown', (e) => e.preventDefault());
    r.addEventListener('click', () => go(it));
    r.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
    return r;
  }
  function draw() {
    const q = input.value;
    list.replaceChildren();
    if (q.trim()) rows = search(items || [], q);
    else {
      const rec = store.get(RECENT_KEY, []);
      const seen = new Set(rec.map((r) => r.href));
      const bad = (items || []).filter((x) => (x.tag === '서버' || x.tag === '플로우' || x.tag === '서비스') && isBad(x.state) && !seen.has(x.href))
        .sort((a, b) => rankOf(a.state) - rankOf(b.state)).slice(0, 10);
      rows = rec.concat(bad);
      const head = (t) => el('div', { class: 'qj-head', role: 'presentation', text: t });
      if (rec.length) list.append(head('최근 간 곳'));
      rec.forEach((it, i) => list.append(rowEl(it, i)));
      if (bad.length) list.append(head('이상 있음'));
      bad.forEach((it, i) => list.append(rowEl(it, rec.length + i)));
    }
    if (q.trim()) rows.forEach((it, i) => list.append(rowEl(it, i)));
    if (!rows.length) list.append(el('div', { class: 'qj-none', role: 'presentation', text: q.trim() ? '없음' : (items ? '' : '불러오는 중…') }));
    sel = Math.min(sel, Math.max(rows.length - 1, 0));
    mark();
  }

  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[sel]) go(rows[sel]);
    }
  });
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });

  box = { close };
  draw();
  input.focus();
  loadItems().then((r) => { items = r; if (!closed) draw(); });
}

export function initQuickJump() {
  const btn = document.getElementById('qj-open');
  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (box) box.close(); else open();
      return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !box) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      open();
    }
  });
}
