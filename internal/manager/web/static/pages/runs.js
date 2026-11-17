// 실행 이력 #runs[?flow=&host=&status=&type=&q=]
// 참고한 사례(05 §14.10): Datadog CI Pipeline Visibility(실행 수 · 실패율 · 소요 시간 백분위, 실행 목록 거르기),
// GitHub Actions 워크플로 실행 목록(상태 아이콘 · 소요 시간), Control-M "Jobs by hour"(시간대별 실행 막대),
// Airflow 3 태스크 인스턴스 표(상태 · 시도 · 소요 시간).
import { api, poll } from '../api.js';
import { el, fmtDuration, fmtNum, shortExec, info, stateBox, changed, keepFocus, setQuery, setTitle, fmtDT, p2, DASH } from '../ui.js';
import { fmtTime, fmtTick, TIME_INCRS } from '../chart.js';
import { createTimeRange } from '../timerange.js';
import { runStatusHTML, TRIGGER_TEXT } from './batch.js';
import { endText, exitLevel } from './exit.js';

const LIMIT = 1000;

// 상태 묶음: 화면 단추 하나 = 실행 상태 여러 개
export const STATUS_GROUPS = [
  ['', '전체', null],
  ['failed', '실패', ['FAILED', 'TIMEOUT', 'KILLED', 'LOST']],
  ['running', '실행 중', ['RUNNING']],
  ['waiting', '대기', ['WAITING', 'DISPATCHED', 'GATED', 'HELD', 'SCHEDULED']],
  ['succeeded', '성공', ['SUCCEEDED']],
];
const GROUP_OF = new Map(STATUS_GROUPS.flatMap(([k, , sts]) => (sts || []).map((s) => [s, k])));
export const statusGroup = (st) => GROUP_OF.get(st) || 'waiting';
// 주소의 status는 묶음 이름이나 예전 상태 이름(FAILED 등) 모두 받는다.
export function parseStatus(v) {
  if (!v) return '';
  if (STATUS_GROUPS.some(([k]) => k === v)) return v;
  return GROUP_OF.get(String(v).toUpperCase()) || '';
}

// ---- 순수 함수 ----
export const startOf = (r) => r.started_at || r.scheduled_at || 0;
export const durOf = (r, now = Date.now()) => (r.started_at ? (r.ended_at || now) - r.started_at : null);

export function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
// 요약: 실행 수, 성공률(끝난 실행 중 성공), 실패·실행 중 수, 소요 시간 중앙값·p95(끝난 실행)
export function summarize(runs) {
  const c = { total: runs.length, succeeded: 0, failed: 0, running: 0, waiting: 0 };
  const durs = [];
  for (const r of runs) {
    const g = statusGroup(r.status);
    c[g]++;
    if ((g === 'succeeded' || g === 'failed') && r.started_at && r.ended_at) durs.push(r.ended_at - r.started_at);
  }
  durs.sort((a, b) => a - b);
  const done = c.succeeded + c.failed;
  return { ...c, rate: done ? (c.succeeded / done) * 100 : null, p50: pct(durs, 50), p95: pct(durs, 95), finished: done };
}
// 같은 플로우·스텝의 소요 시간 중앙값(끝난 성공 실행 3회 이상일 때만)
export function stepMedians(runs) {
  const by = new Map();
  for (const r of runs) {
    if (r.status !== 'SUCCEEDED' || !r.started_at || !r.ended_at) continue;
    const k = r.flow_id + '/' + r.step_id;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r.ended_at - r.started_at);
  }
  const out = new Map();
  for (const [k, d] of by) if (d.length >= 3) out.set(k, pct(d.sort((a, b) => a - b), 50));
  return out;
}
// 느림 배율: 중앙값의 2배를 넘으면 배율, 아니면 null
export function slowRatio(r, medians, now = Date.now()) {
  const m = medians.get(r.flow_id + '/' + r.step_id);
  const d = durOf(r, now);
  if (!m || d == null || m < 1000) return null;
  const k = d / m;
  return k >= 2 ? k : null;
}
// 시간대 칸 크기: 칸이 48개를 넘지 않는 가장 작은 값
const BUCKETS = [1, 5, 15, 30, 60, 180, 360, 720, 1440].map((m) => m * 60000);
export function bucketSize(from, to, max = 48) {
  return BUCKETS.find((b) => (to - from) / b <= max) || BUCKETS[BUCKETS.length - 1];
}
// 시간대별 실행 수(상태 묶음별). 칸은 고른 구간 [from, to]를 덮고, 경계는 칸 크기의 배수(로컬 시각 기준)
export function timeBuckets(runs, from, to) {
  if (!(to > from)) return { size: 0, buckets: [] };
  const lo = from, hi = to;
  const size = bucketSize(lo, hi);
  const tz = new Date(lo).getTimezoneOffset() * 60000;
  const floor = (t) => Math.floor((t - tz) / size) * size + tz;
  const first = floor(lo), last = floor(hi);
  const buckets = [];
  for (let t = first; t <= last; t += size) buckets.push({ from: t, to: t + size, succeeded: 0, failed: 0, running: 0, waiting: 0 });
  for (const r of runs) {
    const t = startOf(r);
    if (!t || t < lo || t > hi) continue;
    const b = buckets[Math.floor((floor(t) - first) / size)];
    if (b) b[statusGroup(r.status)]++;
  }
  return { size, buckets };
}
// 막대 아래 눈금: 칸 시작~끝을 0~100%로 보고, 읽기 쉬운 간격(TIME_INCRS) 중 8개 이하가 되는 것
export function histTicks(first, last, max = 8) {
  const span = (last - first) / 1000;
  const incr = TIME_INCRS.find((s) => s >= 60 && Math.floor(span / s) + 1 <= max) || 86400 * 7;
  const tz = new Date(first).getTimezoneOffset() * 60;
  const out = [];
  for (let s = Math.ceil((first / 1000 - tz) / incr) * incr + tz; s * 1000 <= last; s += incr) {
    out.push({ at: ((s * 1000 - first) / (last - first)) * 100, text: fmtTick(s, incr) });
  }
  return out;
}
// 주소의 win(“from-to”) → 구간. 잘못되면 null
export function parseWin(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s || ''));
  return m && Number(m[2]) > Number(m[1]) ? { from: Number(m[1]), to: Number(m[2]) } : null;
}
export function matchText(r, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return [r.flow_id, r.step_id, r.exec_id, r.host].some((v) => String(v || '').toLowerCase().includes(s));
}

// 실행 메뉴의 두 화면: 실행 이력(#runs) · 종료 보고서(#exits)
export function runTabs(active) {
  const tab = (id, href, text) => el('a', { href, class: active === id ? 'on' : '', text, ...(active === id ? { 'aria-current': 'page' } : {}) });
  return el('nav', { class: 'rn-tabs', 'aria-label': '실행 보기' }, tab('runs', '#runs', '실행 이력'), tab('exits', '#exits', '종료 보고서'));
}
// 기동한 프로세스 칩(06 §7, 카드 P-E): 실행 중 ●, 종료 보고서 있으면 ■ → #exit/, 그냥 끝났으면 ○. 서비스면 #svc/<id>?host=.
// list: /runs의 procs 맵 한 칸이나 /runs/{id}의 procs. 리더(스텝 명령 자신)는 빼고 띄운 순서로 max개까지 + +n.
export function procChips(list, host, max = 3) {
  const ps = (list || []).filter((p) => !p.leader).sort((a, b) => a.started_at - b.started_at || a.pid - b.pid);
  if (!ps.length) return null;
  const enc = encodeURIComponent;
  const chip = (p) => {
    const st = !p.ended_at ? 'up' : p.exit_id ? 'down' : 'end';
    const href = p.exit_id ? '#exit/' + enc(p.exit_id) : p.service ? `#svc/${enc(p.service)}?host=${enc(host || '')}` : '';
    const title = [`${p.comm} · pid ${p.pid}`, p.service ? `서비스 ${p.service}${p.auto ? ' (자동)' : ''}` : '', st === 'up' ? '실행 중' : st === 'down' ? '종료 보고서' : '종료']
      .filter(Boolean).join(' · ');
    const kids = [el('i', { text: st === 'up' ? '●' : st === 'down' ? '■' : '○' }), p.comm];
    return href ? el('a', { class: 'rn-pc ' + st, href, title, onclick: (ev) => ev.stopPropagation() }, ...kids) : el('span', { class: 'rn-pc ' + st, title }, ...kids);
  };
  return el('span', { class: 'rn-pcs' }, ps.slice(0, max).map(chip),
    ps.length > max ? el('span', { class: 'rn-pcn', text: `+${ps.length - max}`, title: ps.slice(max).map((p) => p.comm).join(', ') }) : null);
}

// 실행 줄의 종료 표시: 그 실행에 딸린 종료 보고(가장 최근 것) 한 칸, 여럿이면 +n
function exitMark(items) {
  if (!items || !items.length) return null;
  const it = items[0];
  const lv = exitLevel(it.category, it.resident) || 'info';
  return el('a', {
    class: 'rn-exit ' + lv, href: '#exit/' + encodeURIComponent(it.id),
    title: `종료 보고서: ${it.comm} ${endText(it)} — ${it.title}` + (items.length > 1 ? ` 외 ${items.length - 1}건` : ''),
    onclick: (ev) => ev.stopPropagation(),
  }, `${lv === 'crit' ? '■' : lv === 'warn' ? '▲' : '●'} ${it.comm} ${endText(it).replace('종료 코드 ', '코드 ')}`, items.length > 1 ? el('span', { class: 'n', text: ` +${items.length - 1}` }) : null);
}

// ---- 화면 ----
let stopFn = null;
let tr = null;

export async function render(host, params, query = {}) {
  const f = { flow: query.flow || '', host: query.host || '', status: parseStatus(query.status), type: query.type || '', q: query.q || '' };
  let win = parseWin(query.win); // 막대를 눌러 고른 시간대 {from, to}. 주소의 win에 남긴다
  setTitle('실행 이력');
  let runs = [];
  let exitsBy = new Map(); // exec_id → 종료 보고(끝난 시각 내림차순)
  let procsBy = {}; // exec_id → 기동한 프로세스(축약, /runs procs 맵)

  const head = el('div', { class: 'rn-head' }, runTabs('runs'));
  const rangeBar = el('div', { class: 'rn-range' });
  const filters = el('div', { class: 'rn-filters' });
  const cache = {}; // 주기 갱신에서 바뀔 때만 다시 그리기(ui.changed)
  const kpis = el('div', { class: 'bt-kpis rn-kpis' });
  const histCard = el('section', { class: 'card rn-card rn-histcard' });
  const listCard = el('section', { class: 'card rn-card rn-listcard' });
  host.append(head, rangeBar, filters, kpis, histCard, listCard);
  tr = createTimeRange(rangeBar, { def: '24h' });

  let flows = [], hosts = [];
  try { flows = (await api('/flows')).flows || []; } catch (e) { /* 거르기 목록 없이 진행 */ }
  try { hosts = (await api('/hosts')).hosts || []; } catch (e) { /* 위와 같음 */ }

  // 주소: 거르기 값을 고치고 시간 구간(range·from·to)은 그대로 둔다
  function keepQuery() {
    const [, qs = ''] = location.hash.slice(1).split('?');
    const p = new URLSearchParams(qs);
    for (const k of ['flow', 'host', 'status', 'type', 'q']) { if (f[k]) p.set(k, f[k]); else p.delete(k); }
    const s = p.toString();
    history.replaceState(null, '', '#runs' + (s ? '?' + s : ''));
  }
  const sel = (key, label, opts, server) => {
    const s = el('select', { 'aria-label': label, 'data-k': key, onchange: () => { f[key] = s.value; keepQuery(); if (server) reload(); else redraw(); } },
      opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === f[key] })));
    return el('label', { class: 'bt-filter' }, el('span', { text: label }), s);
  };
  const search = el('input', { type: 'search', class: 'rn-search', placeholder: '플로우 · 스텝 · 실행 ID 검색', value: f.q, 'aria-label': '검색' });
  let timer = null;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { f.q = search.value.trim(); keepQuery(); redraw(); }, 200); });
  filters.append(
    sel('flow', '플로우', [['', '전체'], ...flows.map((x) => [x.id, x.id])], true),
    sel('host', '실행 서버', [['', '전체'], ...hosts.map((h) => [h.id, h.id])], true),
    sel('type', '실행 유형', [['', '전체'], ...Object.entries(TRIGGER_TEXT)], false),
    el('span', { class: 'grow' }), search);
  function syncSelects() { filters.querySelectorAll('select').forEach((s) => { s.value = f[s.dataset.k] || ''; }); }

  const statusBar = el('div', { class: 'rn-statusbar' });
  const base = () => runs.filter((r) => (!f.type || r.trigger === f.type) && matchText(r, f.q));
  const inWin = (r) => { const t = startOf(r); return !win || (t >= win.from && t < win.to); };

  function kpi(label, value, sub, cls = '', extra = null) {
    const v = el('span', { class: 'kv ' + cls });
    v.innerHTML = value;
    return el('div', { class: 'bt-kpi' }, el('span', { class: 'kl', text: label }), v, extra, el('span', { class: 'ks', text: sub || '' }));
  }
  const numU = (n, u) => `<span class="num">${n}</span>${u ? `<span class="unit">${u}</span>` : ''}`;
  function drawKpis(rows) {
    const s = summarize(rows);
    const rateCls = s.rate == null ? '' : s.rate >= 95 ? 'c-ok' : s.rate >= 80 ? 'c-warn' : 'c-crit';
    const frs = new Set(rows.map((r) => r.flow_run_id).filter(Boolean)).size;
    const rateBar = s.finished ? el('span', { class: 'rn-rate' },
      el('i', { class: 'ok', style: `width:${(s.succeeded / s.finished) * 100}%` }), el('i', { class: 'fail', style: `width:${(s.failed / s.finished) * 100}%` })) : null;
    kpis.replaceChildren(
      kpi('스텝 실행', numU(fmtNum(s.total), '건'), frs ? `플로우 실행 ${fmtNum(frs)}회` : ''),
      kpi('성공률', s.rate == null ? DASH : numU(s.rate.toFixed(1), '%'), s.finished ? `끝난 실행 ${fmtNum(s.finished)}건 중 ${fmtNum(s.succeeded)}건` : '끝난 실행 없음', rateCls, rateBar),
      kpi('실패', numU(fmtNum(s.failed), '건'), '실패 · 시간 초과 · 강제 종료 · 유실', s.failed ? 'c-crit' : ''),
      kpi('실행 중', numU(fmtNum(s.running), '건'), `대기 ${fmtNum(s.waiting)}건`, s.running ? 'c-run' : ''),
      kpi('소요 시간 p50 · p95', s.p50 == null ? DASH : `<span class="num">${fmtDuration(s.p50)}</span><span class="rn-sub">· ${fmtDuration(s.p95)}</span>`, '끝난 실행 기준'));
  }

  function drawStatusBar(rows) {
    const s = summarize(rows);
    const n = { '': s.total, failed: s.failed, running: s.running, waiting: s.waiting, succeeded: s.succeeded };
    const seg = el('div', { class: 'bt-seg', role: 'group', 'aria-label': '상태' }, STATUS_GROUPS.map(([k, label]) => el('button', {
      type: 'button', class: f.status === k ? 'on' : '', 'aria-pressed': f.status === k ? 'true' : 'false',
      onclick: () => { f.status = k; keepQuery(); redraw(); },
    }, k ? el('span', { class: 'dot f-' + k }) : null, label, el('span', { class: 'n', text: fmtNum(n[k]) }))));
    const kids = [seg];
    if (win) kids.push(el('span', { class: 'rn-win' }, `시간대 ${fmtTime(win.from, false)} ~ ${fmtTime(win.to, false).slice(-5)}`,
      el('button', { type: 'button', text: '✕', title: '시간대 거르기 해제', onclick: () => { setWin(null); redraw(); } })));
    statusBar.replaceChildren(...kids);
  }

  const HIDE_M = new Set(['실행 유형', '실행 ID']); // 1200px 이하에서 숨김(CSS .hm)
  const KEYS = ['succeeded', 'failed', 'running', 'waiting'];
  const NAMES = { succeeded: '성공', failed: '실패', running: '실행 중', waiting: '대기' };
  function drawHist(rows) {
    const t = tr.current();
    const { size, buckets } = timeBuckets(rows, t.from, t.to);
    histCard.hidden = !buckets.length;
    if (!buckets.length) { histCard.replaceChildren(); return; }
    const top = Math.max(1, ...buckets.map((b) => KEYS.reduce((a, k) => a + b[k], 0)));
    const cols = buckets.map((b) => {
      const n = KEYS.reduce((a, k) => a + b[k], 0);
      const on = win && win.from === b.from;
      const sameDay = new Date(t.from).toDateString() === new Date(t.to).toDateString();
      const hm = (ts) => `${p2(new Date(ts).getHours())}:${p2(new Date(ts).getMinutes())}`;
      const span = `${sameDay ? hm(b.from) : fmtDT(b.from)}~${sameDay ? hm(b.to) : fmtDT(b.to)}`;
      const what = KEYS.filter((k) => b[k]).map((k) => `${NAMES[k]} ${b[k]}`).join(' · ') || '실행 없음';
      const col = el('button', { type: 'button', class: 'rb' + (n ? '' : ' z') + (on ? ' on' : ''), disabled: !n,
        'data-fk': 'h' + b.from, 'aria-label': `${span} ${what}`, 'aria-pressed': on ? 'true' : 'false',
        title: `${fmtTime(b.from, false)} ~ ${fmtTime(b.to, false).slice(-5)} · ${what}`,
        onclick: () => { if (!n) return; setWin(on ? null : { from: b.from, to: b.to }); redraw(); } });
      for (const k of KEYS) if (b[k]) col.append(el('i', { class: k, style: `height:${(b[k] / top) * 100}%` }));
      return col;
    });
    const ticks = histTicks(buckets[0].from, buckets[buckets.length - 1].to).map((x) => el('span', { style: `left:${x.at}%`, text: x.text }));
    const sizeText = size >= 3600000 ? `${size / 3600000}시간` : `${size / 60000}분`;
    histCard.replaceChildren(
      el('div', { class: 'rn-ch' }, el('h3', { class: 'sec', text: '시간대별 실행' }), el('span', { class: 'rn-unit', text: `${sizeText} 단위` }),
        info('시작 시각(시작 전이면 예정 시각) 기준. 막대를 누르면 그 시간대만 아래 표에 보인다'),
        el('span', { class: 'grow' }),
        el('span', { class: 'rn-lg' }, KEYS.map((k) => el('span', {}, el('i', { class: k }), NAMES[k])))),
      el('div', { class: 'rn-hist' },
        el('div', { class: 'rn-hy' }, el('span', { class: 'num', text: fmtNum(top) }), el('span', { text: '0' })),
        el('div', { class: 'rn-hm' }, el('div', { class: 'rn-hbars' }, cols), el('div', { class: 'rn-hx' }, ticks))));
  }

  const scroll = el('div', { class: 'rn-scroll tblwrap' });
  const listHead = el('div', { class: 'rn-ch' });
  listCard.append(listHead, scroll);

  function durCell(r, now, med, maxDur) {
    const d = durOf(r, now);
    const slow = slowRatio(r, med, now);
    return el('td', { class: 'dur' }, el('div', { class: 'dw' },
      el('span', { class: 'dt num', text: d == null ? DASH : fmtDuration(d) }),
      el('span', { class: 'dtrack' }, d == null ? null : el('i', { class: 'dbar' + (r.ended_at ? '' : ' live') + (slow ? ' slow' : ''), style: `width:${Math.max(2, (d / maxDur) * 100)}%` })),
      slow ? el('span', { class: 'slow-tag', text: `${slow.toFixed(1)}×`, title: `같은 스텝 소요 시간 중앙값 ${fmtDuration(med.get(r.flow_id + '/' + r.step_id))}의 ${slow.toFixed(1)}배` }) : null));
  }
  // 칩(■)으로 이미 보이는 종료 보고서는 종료 표시에서 뺀다(같은 사실 두 번 금지)
  function exitsOnly(id) {
    const shown = new Set((procsBy[id] || []).map((p) => p.exit_id).filter(Boolean));
    return (exitsBy.get(id) || []).filter((x) => !shown.has(x.id));
  }
  function drawTable(rows) {
    const now = Date.now();
    const med = stepMedians(runs);
    const maxDur = Math.max(1, ...rows.map((r) => durOf(r, now) || 0));
    const t = el('table', { class: 'rn-tbl' });
    t.append(el('colgroup', {}, ['c-st', 'c-at', 'c-name', 'c-host', 'c-try', 'c-dur', 'c-code', 'c-type hm', 'c-id hm'].map((c) => el('col', { class: c }))));
    t.append(el('thead', {}, el('tr', {}, [['상태'], ['시작 시각'], ['플로우 › 스텝'], ['실행 서버'], ['시도', 'num'], ['소요 시간'], ['종료 코드', 'num'], ['실행 유형'], ['실행 ID']]
      .map(([h, c]) => el('th', { class: (c || '') + (HIDE_M.has(h) ? ' hm' : ''), text: h })))));
    const tb = el('tbody');
    if (!rows.length) tb.append(el('tr', {}, el('td', { colspan: 9, class: 'empty', text: runs.length ? '조건에 맞는 실행 없음' : '이 구간에 실행 없음' })));
    for (const r of rows) {
      const st = el('td'); st.innerHTML = runStatusHTML(r);
      const tr2 = el('tr', { class: 'click g-' + statusGroup(r.status), tabindex: '0', 'data-fk': r.exec_id },
        st,
        el('td', { class: 'num at', text: fmtDT(startOf(r)), title: r.started_at ? '' : '예정 시각' }),
        el('td', { class: 'name' }, el('div', { class: 'rn-nm' },
          el('span', { class: 'fs' }, el('a', { href: '#runs?flow=' + encodeURIComponent(r.flow_id), class: 'fl', text: r.flow_id, title: '이 플로우만 보기',
            onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); f.flow = r.flow_id; keepQuery(); syncSelects(); reload(); } }),
          el('span', { class: 'sep', text: ' › ' }), el('span', { class: 'step', text: r.step_id, title: r.step_id })),
          procChips(procsBy[r.exec_id], r.host), exitMark(exitsOnly(r.exec_id)))),
        el('td', { class: 'cut', text: r.host || DASH }),
        el('td', { class: 'num' + (r.attempt > 1 ? ' retry' : ''), text: String(r.attempt ?? DASH) }),
        durCell(r, now, med, maxDur),
        el('td', { class: 'num' + (r.exit_code ? ' bad' : ''), text: r.exit_code == null ? DASH : String(r.exit_code) }),
        el('td', { class: 'hm', text: TRIGGER_TEXT[r.trigger] || r.trigger || DASH }),
        el('td', { class: 'id hm', text: shortExec(r.exec_id), title: r.exec_id }));
      const go = () => { location.hash = '#run/' + encodeURIComponent(r.exec_id); };
      tr2.addEventListener('click', go);
      tr2.addEventListener('keydown', (ev) => { if (ev.target === tr2 && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); go(); } });
      tb.append(tr2);
    }
    t.append(tb);
    const keep = scroll.scrollTop;
    scroll.replaceChildren(t);
    scroll.scrollTop = keep;
    listHead.replaceChildren(statusBar, el('span', { class: 'grow' }),
      el('span', { class: 'rn-count', text: `${fmtNum(rows.length)}건` + (runs.length >= LIMIT ? ` · 최근 ${fmtNum(LIMIT)}건까지만 불러옴` : '') }));
  }

  function draw() {
    const b = base();
    const inW = b.filter(inWin);
    drawKpis(inW);
    drawHist(b);
    drawStatusBar(inW);
    const groupSts = (STATUS_GROUPS.find(([k]) => k === f.status) || [])[2];
    drawTable(inW.filter((r) => !groupSts || groupSts.includes(r.status)));
  }

  const setWin = (w) => { win = w; setQuery({ win: w ? `${Math.round(w.from)}-${Math.round(w.to)}` : '' }); };
  const redraw = () => keepFocus(host, draw);
  let seq = 0;
  let loaded = false;
  async function load() {
    const my = ++seq;
    const t = tr.current();
    const q = new URLSearchParams({ limit: String(LIMIT), from: String(Math.round(t.from)), to: String(Math.round(t.to)) });
    for (const k of ['flow', 'host']) if (f[k]) q.set(k, f[k]);
    // 종료 보고는 그 구간에 시작한 실행의 프로세스가 구간 뒤에 죽었을 수 있어 끝을 열어 둔다
    const [r, ex] = await Promise.all([
      api('/runs?' + q),
      api('/exits?' + new URLSearchParams({ from: String(Math.round(t.from)), limit: '1000', ...(f.host ? { host: f.host } : {}) })).catch(() => ({ exits: [] })),
    ]);
    if (my !== seq) return;
    // 실행 중인 줄은 소요 시간이 흐르므로 5초 칸을 열쇠에 넣는다
    const tick = (r.runs || []).some((x) => !x.ended_at && x.started_at) ? Math.floor(Date.now() / 5000) : 0;
    const wasLoaded = loaded;
    loaded = true;
    if (wasLoaded && !changed(cache, 'data', [r.runs, r.procs, ex.exits, tick])) return;
    runs = r.runs || [];
    procsBy = r.procs || {};
    exitsBy = new Map();
    for (const it of ex.exits || []) {
      if (!it.exec_id) continue;
      if (!exitsBy.has(it.exec_id)) exitsBy.set(it.exec_id, []);
      exitsBy.get(it.exec_id).push(it);
    }
    redraw();
  }
  // 처음·거르기를 바꾼 뒤의 불러오기: 불러오는 중 → 실패면 까닭과 다시 시도
  async function reload() {
    loaded = false;
    delete cache.data;
    kpis.replaceChildren(); histCard.replaceChildren(); histCard.hidden = true;
    scroll.replaceChildren(stateBox('loading'));
    try { await load(); } catch (e) {
      if (!loaded || !runs.length) {
        scroll.replaceChildren(stateBox('error', { text: '실행 이력을 불러오지 못함', e, detail: '서버 연결을 확인한 뒤 다시 시도', retry: reload }));
      }
    }
  }
  tr.onChange(() => { setWin(null); reload(); });
  await reload();
  stopFn = poll(async () => { if (tr.current().live && loaded) await load(); }, 5000);
}
export function dispose() {
  if (stopFn) { try { stopFn(); } catch (e) { /* 무시 */ } }
  stopFn = null;
  tr?.destroy();
  tr = null;
}
