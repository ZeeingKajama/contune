// 알림(#alerts): 표 · 거르기 · 확인.
import { api, poll } from '../api.js';
import { el, relTime, fmtClock, table, badgeHTML, DASH, LEVEL_TEXT as LV, stateBox, act, confirmBox, changed, keepFocus, setQuery } from '../ui.js';
import { alertTarget, panelsInScope, serviceTitles } from './dashboard.js';
import { gate } from '../auth.js';
import { exitHashOfAlert } from './exit.js';

// ---- 순수 함수 (DOM 없이 호출) ----
export const KIND_TEXT = { host: '서버', run: '실행', tile: '업무', log: '로그', risk: '장애 위험도', exit: '프로세스 종료', service: '서비스' };
export const LEVEL_TEXT = { crit: LV.crit, warn: LV.warn };
export const STATE_TEXT = { firing: '진행 중', resolved: '해소' };
const LEVEL_RANK = { crit: 0, warn: 1 };

// firing 먼저, 수준 높은 것, 최신 순
export function sortAlertRows(list) {
  return [...list].sort((a, b) =>
    (a.state === b.state ? 0 : a.state === 'firing' ? -1 : 1) ||
    (LEVEL_RANK[a.level] ?? 2) - (LEVEL_RANK[b.level] ?? 2) || b.ts - a.ts);
}
// f: {kind, level, state} 빈 값은 전체
export function filterAlerts(list, f) {
  return list.filter((a) =>
    (!f.kind || a.kind === f.kind) && (!f.level || a.level === f.level) &&
    (!f.state || f.state === 'all' || a.state === f.state));
}
// 서비스 알림(kind service, name = 서비스 ID)은 "체결 · match-01"
export const alertTargetName = (a, titles) => (a.kind === 'service' && a.name
  ? [(titles && titles[a.name]) || a.name, a.host].filter(Boolean).join(' · ')
  : a.host || a.group || a.name || DASH);
export const isUnacked = (a) => a.state === 'firing' && !a.acked_at;
// 메시지의 시도 횟수 같은 숫자 꼬리는 뺀다: "… 실행 실패 (시도 2)" → "… 실행 실패"
export const normMessage = (m) => String(m ?? '')
  .replace(/\s*[(（]\s*(시도|재시도)\s*\d+\s*[)）]\s*$/, '').replace(/\s*\d+\s*(회|번)\s*$/, '').trim();
// 같은 알림 묶기: 상태·종류·대상·메시지(꼬리 뺀)가 같으면 한 묶음. 순서는 처음 나온 자리.
// → [{key, items(최신순), head(최신), ts(가장 최근), level(가장 높은), pending(확인 안 한 진행 중 알림)}]
export function groupAlerts(list, titles) {
  const map = new Map();
  for (const a of list) {
    const key = [a.state, a.kind, alertTargetName(a, titles), normMessage(a.message)].join('|');
    let g = map.get(key);
    if (!g) { g = { key, items: [] }; map.set(key, g); }
    g.items.push(a);
  }
  return [...map.values()].map((g) => {
    const items = [...g.items].sort((x, y) => y.ts - x.ts);
    const level = items.reduce((m, a) => ((LEVEL_RANK[a.level] ?? 2) < (LEVEL_RANK[m] ?? 2) ? a.level : m), items[0].level);
    return { key: g.key, items, head: items[0], ts: items[0].ts, level, pending: items.filter(isUnacked) };
  });
}
const ALERT_LIMIT = 200;


// ---- 화면 ----
function select(label, opts, cur, onChange) {
  return el('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur })));
}

export function render(root, params, query) {
  const f = { kind: (query && query.kind) || '', level: (query && query.level) || '', state: (query && query.state) || 'firing' };
  root.innerHTML = '';
  const bar = el('div', { class: 'afilter' });
  const bulk = el('div', { class: 'abulk' });
  const body = el('div', { class: 'abody' });
  root.append(el('h2', { class: 'sec', text: '알림' }), bar, bulk, body);
  let all = [], panels = [], titles = {}, loaded = false;
  const sel = new Set();      // 고른 묶음 키
  const open = new Set();     // 펼친 묶음 키
  const sig = {};
  let groups = [];

  const ackable = () => groups.filter((g) => g.pending.length);
  const selItems = () => groups.filter((g) => sel.has(g.key)).flatMap((g) => g.pending);
  const drawBulk = () => {
    const can = ackable();
    for (const k of [...sel]) if (!can.some((g) => g.key === k)) sel.delete(k);
    const n = selItems().length;
    allBox.checked = can.length > 0 && can.every((g) => sel.has(g.key));
    allBox.indeterminate = !allBox.checked && sel.size > 0;
    allBox.disabled = !can.length || allBox.classList.contains('locked');
    bulkBtn.textContent = `고른 ${n}건 확인`;
    if (!bulkBtn.classList.contains('locked')) bulkBtn.disabled = n === 0;
  };
  const allBox = gate(el('input', { type: 'checkbox', id: 'abulk-all', onchange: (e) => {
    sel.clear();
    if (e.target.checked) for (const g of ackable()) sel.add(g.key);
    redraw();
  } }), 'operator');
  const bulkBtn = gate(el('button', { type: 'button', text: '고른 0건 확인', onclick: () => ackItems(bulkBtn, selItems()) }), 'operator');
  bulk.append(el('label', { for: 'abulk-all' }, allBox, ' 모두 고르기'), bulkBtn);

  // 알림 여러 건 확인: 건수를 묻고 하나씩 부른다. 일부만 되면 몇 건 못 했는지 알린다.
  const ackItems = async (btn, items) => {
    if (!items.length) return;
    if (items.length > 1) {
      const r = await confirmBox({ title: `알림 ${items.length}건 확인`, message: '고른 알림을 확인 처리합니다.', okText: '확인' });
      if (!r.ok) return;
    }
    await act(btn, async () => {
      let failed = 0, last = null;
      for (const a of items) {
        try { await api(`/alerts/${a.id}/ack`, { method: 'POST' }); a.acked_at = Date.now(); } catch (e) { failed++; last = e; }
      }
      if (failed) {
        if (failed === items.length) throw last;
        throw new Error(`${items.length}건 중 ${failed}건 못 함`);
      }
    }, { ok: items.length > 1 ? `${items.length}건 확인함` : undefined, fail: '확인하지 못함' });
    redraw();
    refreshBell();
  };

  const ackBtn = (items, text) => gate(el('button', { type: 'button', text, onclick: (e) => ackItems(e.currentTarget, items) }), 'operator');
  const ackCell = (g, a) => {
    const items = a ? (isUnacked(a) ? [a] : []) : g.pending;
    if (items.length) return ackBtn(items, a || g.items.length === 1 ? '확인' : `${items.length}건 확인`);
    const t = a ? a.acked_at : Math.max(0, ...g.items.map((x) => x.acked_at || 0));
    if (t) return el('span', { class: 'acked', text: `✓ ${fmtClock(t)}` });
    return DASH;
  };

  const draw = () => {
    const rows = [];
    groups = groupAlerts(sortAlertRows(filterAlerts(all, f)), titles);
    for (const g of groups) {
      rows.push({ g, a: null });
      if (open.has(g.key) && g.items.length > 1) for (const a of g.items) rows.push({ g, a });
    }
    drawBulk();
    if (!groups.length) { body.replaceChildren(stateBox('empty', { text: '알림 없음' })); return; }
    const now = Date.now();
    const showState = f.state === 'all';
    const cols = [
      { label: '', cls: 'chk', render: (r) => {
        if (r.a || !r.g.pending.length) return '';
        return gate(el('input', { type: 'checkbox', 'aria-label': '고르기', checked: sel.has(r.g.key), onchange: (e) => { if (e.target.checked) sel.add(r.g.key); else sel.delete(r.g.key); drawBulk(); } }), 'operator');
      } },
      { label: '등급', cls: 'lv', render: (r) => badgeHTML(r.a ? r.a.level : r.g.level, LEVEL_TEXT[r.a ? r.a.level : r.g.level]), html: true },
      { label: '종류', cls: 'kind', render: (r) => KIND_TEXT[r.g.head.kind] || r.g.head.kind },
      { label: '대상', cls: 'tgt', render: (r) => { const h = r.a || r.g.head; return el('a', { href: h.kind === 'exit' ? exitHashOfAlert(h) : alertTarget(h, panels), text: alertTargetName(h, titles) }); } },
      { label: '메시지', cls: 'msg', render: (r) => {
        if (r.a) return r.a.message;
        const n = r.g.items.length;
        if (n < 2) return r.g.head.message;
        const on = open.has(r.g.key);
        return el('span', {}, normMessage(r.g.head.message) + ' ',
          el('button', { type: 'button', class: 'ilink agrp', 'aria-expanded': String(on), 'aria-label': `같은 알림 ${n}건 ${on ? '접기' : '펼치기'}`, text: `×${n} ${on ? '▾' : '▸'}`,
            onclick: () => { if (on) open.delete(r.g.key); else open.add(r.g.key); redraw(); } }));
      } },
      { label: '시각', cls: 'time', render: (r) => { const t = r.a ? r.a.ts : r.g.ts; return `${fmtClock(t)} (${relTime(t, now)})`; } },
      ...(showState ? [{ label: '상태', cls: 'st', render: (r) => STATE_TEXT[(r.a || r.g.head).state] || (r.a || r.g.head).state }] : []),
      { label: '확인', cls: 'ack', render: (r) => ackCell(r.g, r.a) },
    ];
    const t = table({ rows, columns: cols, rowKey: (r) => (r.a ? `${r.g.key}#${r.a.id}` : r.g.key) });
    t.classList.add('atbl');
    [...t.tHead.rows[0].cells].forEach((th, i) => th.classList.add('c-' + cols[i].cls));
    [...t.tBodies[0].rows].forEach((tr, ri) => {
      if (rows[ri].a) tr.classList.add('achild');
      [...tr.cells].forEach((td, i) => td.classList.add('c-' + cols[i].cls));
    });
    const wrap = el('div', { class: 'tblwrap' }, t);
    body.replaceChildren(wrap, ...(all.length >= ALERT_LIMIT ? [el('p', { class: 'anote', text: `최근 ${ALERT_LIMIT}건만` })] : []));
  };
  const redraw = () => keepFocus(body, draw);

  const drawBar = () => {
    bar.replaceChildren(
      select('종류', [['', '종류 전체'], ...Object.entries(KIND_TEXT)], f.kind, (v) => { f.kind = v; setQuery({ kind: v }); redraw(); }),
      select('등급', [['', '등급 전체'], ...Object.entries(LEVEL_TEXT)], f.level, (v) => { f.level = v; setQuery({ level: v }); redraw(); }),
      select('상태', [['firing', '진행 중'], ['resolved', '해소'], ['all', '전체']], f.state, (v) => { f.state = v; setQuery({ state: v === 'firing' ? '' : v }); sig.rows = ''; load().catch(() => {}); }));
  };
  const load = async () => {
    try {
      const [a, p, t] = await Promise.all([api(`/alerts?state=all&limit=${ALERT_LIMIT}`), api('/panels').catch(() => ({ panels: [] })), serviceTitles()]);
      titles = t;
      all = a.alerts || [];
      panels = panelsInScope(p.panels || [], '');
      const first = !loaded;
      loaded = true;
      // 분 단위로 뭉개 두면 상대 시각 때문에 매번 다시 그리지 않는다
      if (first || changed(sig, 'rows', [all.map((x) => [x.id, x.state, x.acked_at, Math.floor(x.ts / 60000), x.message]), f.state, titles])) redraw();
    } catch (e) {
      if (!loaded) body.replaceChildren(stateBox('error', { text: '알림을 불러오지 못함', e, retry: () => { body.replaceChildren(stateBox('loading')); load().catch(() => {}); } }));
      throw e;
    }
  };
  drawBar();
  drawBulk();
  body.append(stateBox('loading'));
  poll(load, 5000);
}

// 위 막대의 종 숫자를 바로 갱신
async function refreshBell() {
  try {
    const r = await api('/alerts?state=firing');
    const n = (r.alerts || []).filter((a) => !a.acked_at).length;
    const bn = document.getElementById('bell-n');
    if (bn) bn.textContent = String(n);
    document.getElementById('bell')?.classList.toggle('has', n > 0);
  } catch (e) { /* 다음 주기 */ }
}
export function dispose() {}
