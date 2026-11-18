// 관제 AI 화면 조각: 상황 브리핑 카드(GET /brief) · 알림 → 원인 분석 서랍(GET /alerts/{id}/trace).
// 근거는 매니저가 결정론적으로 모으고 LLM은 문장만 쓴다. 브리핑 카드는 대표 이슈 하나를 현상 · 추정 원인 · 권장 조치 세 칸으로,
// 나머지는 기타 이슈 한 줄로 보인다(같은 사실을 한 곳에만). 칸의 줄은 그 근거를 볼 곳으로 가는 링크이고, AI 판단 문장에는 근거 칩이 붙는다.
// LLM이 없거나 답이 계약에 맞지 않으면 규칙 기반으로 보이고 그렇게 표시한다. 순수 함수는 DOM 없이 import된다.
import { api, poll } from './api.js';
import { el, enc, esc, fmtNum, fmtClock, DASH, LEVEL_TEXT, openDrawer, closeDrawer, info, keepFocus, levelIcon } from './ui.js';

export const AI_MARK = '✦';

// ---- 순수 함수 ----

// 원인 분석 → 서비스 타임머신(A·B 구간과 가장 늘어난 함수가 골라진 채로). 서비스가 아니면 실행 화면.
export function traceHash(t) {
  if (!t) return null;
  if (!t.service) return t.owner && !String(t.owner).startsWith('svc:') ? `#run/${enc(t.owner)}` : null;
  const p = new URLSearchParams();
  if (t.host) p.set('host', t.host);
  const a = t.a || {}, b = t.b || {};
  if (b.from && b.to) {
    const from = Math.min(a.from || b.from, b.from) - 60000, to = b.to + 60000;
    p.set('from', String(Math.round(from)));
    p.set('to', String(Math.round(to)));
    if (t.compared && a.from && a.to) p.set('a', `${Math.round(a.from)}-${Math.round(a.to)}`);
    p.set('b', `${Math.round(b.from)}-${Math.round(b.to)}`);
  }
  if (t.top && t.top.leaf) p.set('hl', t.top.leaf);
  return `#svc/${enc(t.service)}?${p}`;
}

// 주소의 a·b(“from-to”)를 구간으로. 잘못되면 null
export function parseSpan(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s || ''));
  if (!m) return null;
  const from = Number(m[1]), to = Number(m[2]);
  return to > from ? { from, to } : null;
}

// 알림에 원인 분석 단추를 달지: 종료 알림은 종료 보고서가 따로 가린다
export const traceable = (a) => !!a && a.kind !== 'exit' && a.id != null;

// 근거 → 볼 곳. ctx {alertHref(a), trace}
export function evidenceHref(e, ctx = {}) {
  if (!e) return null;
  const tr = ctx.trace || null;
  switch (e.kind) {
    case 'alert': return e.alert && ctx.alertHref ? ctx.alertHref(e.alert) : null;
    case 'trace': case 'fn': case 'path': case 'window': case 'metric': case 'logs': case 'owner':
      return tr ? traceHash(tr) : null;
    case 'risk': case 'incident': return '#risk';
    case 'flow': return e.exec_id ? `#run/${enc(e.exec_id)}` : '#runs';
    case 'audit': return '#audit';
    default: return null;
  }
}

// AI 표시: {cls, text, title}. by: llm | rule, ai.state: none | wait | pending | ok | error
export function aiBadge(by, ai) {
  const st = (ai && ai.state) || 'none';
  const model = (ai && ai.model) || '';
  if (by === 'llm') return { cls: 'llm', text: `${AI_MARK} AI 작성${model ? ' · ' + model : ''}`, title: 'LLM이 근거 묶음만 보고 쓴 글. 근거 ID 검사를 통과했다' };
  switch (st) {
    case 'pending': return { cls: 'pend', text: `${AI_MARK} AI 작성 중…`, title: '그동안은 규칙 기반 글을 보인다' };
    case 'error': return { cls: 'err', text: '규칙 기반 · AI 오류', title: `LLM 답을 쓰지 못함(규칙 기반 글을 보임): ${(ai && ai.error) || ''}` };
    case 'wait': return { cls: 'wait', text: '규칙 기반 · AI 대기', title: '데이터가 다 모이거나 다시 쓸 차례가 되면 AI가 쓴다' };
    default: return { cls: 'rule', text: '규칙 기반', title: 'LLM 미연결. 매니저 설정 llm(type: claude-cli · anthropic · openai)을 연결하면 AI가 같은 근거로 제목 · 판단을 쓴다' };
  }
}

export const CONF_TEXT = { high: '신뢰도 높음', medium: '신뢰도 보통', low: '신뢰도 낮음' };
const pctText = (v) => `${(Number(v) || 0).toFixed(1)}%`;
const ppText = (v) => `${v >= 0 ? '+' : ''}${(Number(v) || 0).toFixed(1)}%p`;

// 브리핑 서명: 같은 글 · 값이면 다시 그리지 않는다(타자 효과는 새 문장에만)
export function briefSig(b) {
  if (!b) return '';
  const t = b.trace;
  return JSON.stringify([b.by, b.stale, b.level, b.title, b.headline, (b.lines || []).map((l) => [l.text, l.refs]), b.focus, b.others, b.next_checks, b.ai && b.ai.state,
    t && [t.alert_id, t.state, t.top, t.path, t.trigger, t.metric, t.diag && t.diag.confidence, t.ai && t.ai.state]]);
}

// 기간 "45초" · "4분" · "1시간 5분"
export function durText(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  const m = Math.floor((s % 3600) / 60);
  return `${Math.floor(s / 3600)}시간${m ? ` ${m}분` : ''}`;
}

// 브리핑 화면 모양(순수): 제목 · 수준 · 부제 · AI 판단 줄 · 왼쪽 칸(현상 또는 진행 중 이상) · 아래 기타 이슈.
// 대표 이슈가 있으면 왼쪽 칸은 그 현상이고 나머지는 기타 이슈로, 없으면 진행 중 이상이 왼쪽 칸에 온다.
export function briefView(b, now = Date.now()) {
  const f = b.focus || null;
  const level = (f && f.level) || b.level || 'ok';
  const title = (b.by === 'llm' && b.headline) || b.title || b.headline || DASH;
  const meta = [];
  if (f) {
    if (f.since) meta.push(`발생 ${fmtClock(f.since)}`, `${durText(now - f.since)} 지속`);
    if ((f.hosts || []).length) meta.push(f.hosts.join(', '));
  } else if (level === 'ok') {
    const sc = (b.evidence || []).find((e) => e.kind === 'scope');
    const m = sc && /서버 ([\d,]+)대/.exec(sc.title || '');
    if (m) meta.push(`서버 ${m[1]}대`);
    if (!(b.others || []).length) meta.push('진행 중 알림 없음');
  }
  const judge = b.by === 'llm' ? (b.lines || []) : [];
  const others = b.others || [];
  return { level, title, meta, judge, focus: f, list: f ? null : others, others: f ? others : [] };
}

// ---- 화면 ----

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// 타자 효과: 노드들의 글자를 차례로 채운다. 전체 0.9초 안팎
function typeIn(nodes) {
  const items = nodes.map((n) => ({ n, text: n.textContent })).filter((x) => x.text);
  if (reduced() || !items.length) return;
  for (const x of items) x.n.textContent = '';
  const total = items.reduce((s, x) => s + x.text.length, 0);
  const per = Math.max(2, Math.ceil(total / 55)); // 약 55 프레임
  let i = 0, k = 0;
  const step = () => {
    let left = per;
    while (left > 0 && i < items.length) {
      const x = items[i];
      const take = Math.min(left, x.text.length - k);
      k += take;
      left -= take;
      x.n.textContent = x.text.slice(0, k);
      if (k >= x.text.length) { i++; k = 0; }
    }
    if (i < items.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function chips(refs, ev, ctx) {
  const box = el('span', { class: 'ai-refs' });
  for (const id of refs || []) {
    const e = ev.get(id);
    if (!e) continue;
    const href = evidenceHref(e, ctx);
    const tip = [e.title, ...(e.lines || [])].filter(Boolean).join('\n');
    const label = e.label || e.id;
    const c = href ? el('a', { class: `ai-ref k-${e.kind}`, href, title: tip, text: label })
      : el('span', { class: `ai-ref k-${e.kind}`, title: tip, text: label });
    if (e.kind === 'trace' && ctx.onTrace && e.alert_id) {
      c.addEventListener('click', (ev2) => { ev2.preventDefault(); ctx.onTrace(e.alert_id); });
    }
    box.append(c);
  }
  return box;
}

function badgeEl(by, ai) {
  const b = aiBadge(by, ai);
  return el('span', { class: `ai-by ${b.cls}`, title: b.title, text: b.text });
}

// 원인 분석이 없는 대표 이슈의 주 단추: 첫 현상 알림이 가는 화면 이름
const TARGET_TEXT = { tile: '업무 패널', service: '서비스 화면', log: '로그', host: '서버 상세', run: '실행 화면' };

// 근거 ID들 중 처음으로 갈 곳이 있는 것
function refHref(refs, ev, ctx) {
  for (const id of refs || []) {
    const h = evidenceHref(ev.get(id), ctx);
    if (h) return h;
  }
  return null;
}
const linkOr = (href, attrs, ...kids) => (href ? el('a', { ...attrs, href }, ...kids) : el('span', attrs, ...kids));

// 상황 브리핑 카드를 slot에 그린다. 글 · 값이 바뀌었을 때만 다시 그리고, 새 제목 · 판단 문장은 타자 효과로.
// ctx {alertHref(a), onTrace(alertId)}
export function renderBrief(slot, b, ctx = {}) {
  if (!b) {
    if (!slot.firstChild) slot.replaceChildren(el('section', { class: 'ai-brief lv-ok' }, el('div', { class: 'ai-h' },
      el('span', { class: 'ai-mark', text: AI_MARK }), el('h2', { text: 'AI 상황 브리핑' }), el('span', { class: 'ai-at', text: '브리핑을 불러오지 못함' }))));
    return;
  }
  const sig = briefSig(b);
  const at = slot.querySelector('.ai-at');
  const evN = (b.evidence || []).filter((e) => e.kind !== 'scope').length;
  const fresh = b.stale ? ` · 새 상황 반영 중${b.ai && b.ai.state === 'pending' ? '…' : ''}` : '';
  const atText = `${fmtClock(b.written_at || b.at)} 기준${fresh}`;
  const atTitle = `근거 ${evN}개 · ${b.by === 'llm' ? 'AI가 쓴 때' : '규칙으로 계산한 때'}`;
  if (slot.dataset.sig === sig) { if (at) at.textContent = atText; return; }
  const first = !slot.dataset.sig;
  slot.dataset.sig = sig;
  const ev = new Map((b.evidence || []).map((e) => [e.id, e]));
  const tctx = { ...ctx, trace: b.trace };
  const v = briefView(b);
  const lv = v.level;

  // 상태 줄: 수준 아이콘 · 제목 · 발생 · 지속 · 서버(· 이 이슈의 장애 기록)
  const titleEl = el('h3', { class: 'ab-title', text: v.title });
  const inc = v.focus && v.focus.incident;
  const status = el('div', { class: `ab-status lv-${lv}` },
    el('span', { class: `ab-sev lv-${lv}` }, levelIcon(lv), LEVEL_TEXT[lv] || lv),
    titleEl,
    v.meta.length ? el('span', { class: 'ab-meta', text: v.meta.join(' · ') }) : null,
    inc ? el('a', { class: 'ab-inc', href: '#risk', title: `${inc.title} · ${fmtClock(inc.start)} 시작` }, '장애 기록 진행 중') : null);

  // AI 판단(LLM일 때만): 칸들을 이어 읽는 인과 · 별건 구분. 줄마다 근거 칩
  const judgeLines = v.judge.map((l) => el('li', {}, el('span', { class: 'ab-jt', text: l.text }), chips(l.refs, ev, tctx)));
  const judge = judgeLines.length ? el('div', { class: 'ab-judge' }, el('span', { class: 'ai-mark', text: AI_MARK, title: 'AI 판단' }),
    el('ul', {}, ...judgeLines)) : null;

  // 왼쪽 칸: 현상(대표 이슈) 또는 진행 중 이상(대표 이슈 없음)
  const cols = [];
  if (v.focus) {
    const many = (v.focus.hosts || []).length > 1;
    const rows = (v.focus.symptoms || []).map((sy) => {
      const e = ev.get((sy.refs || [])[0]);
      const href = e && e.alert && ctx.alertHref ? ctx.alertHref(e.alert) : refHref(sy.refs, ev, tctx);
      const host = sy.host && sy.host !== sy.label && (many || !(v.focus.hosts || []).includes(sy.host)) ? sy.host : '';
      return el('li', {}, linkOr(href, { class: 'ab-row', title: e ? e.title : '' }, levelIcon(sy.level),
        el('span', { class: 'ab-l', text: sy.label }), el('span', { class: 'ab-v num', text: sy.value }),
        el('span', { class: 'ab-m', text: [sy.limit, host].filter(Boolean).join(' · ') })));
    });
    cols.push(el('section', { class: 'ab-col ab-sym' }, el('h4', { text: '현상' }), el('ul', { class: 'ab-rows' }, ...rows)));
  } else if (v.list.length) {
    const rows = v.list.map((o) => el('li', {}, linkOr(refHref(o.refs, ev, tctx), { class: 'ab-row one', title: o.text }, levelIcon(o.level || 'ok'),
      el('span', { class: 'ab-l', text: o.text }))));
    cols.push(el('section', { class: 'ab-col ab-sym' }, el('h4', { text: lv === 'ok' ? '최근 상황' : '진행 중 이슈' }), el('ul', { class: 'ab-rows' }, ...rows)));
  }
  const t = b.trace && (!v.focus || v.focus.traced) ? b.trace : null;
  if (t) cols.push(causeCol(t));
  const checks = b.next_checks || [];
  const href = t ? traceHash(t) : null;
  const firstAlert = v.focus && ev.get(((v.focus.symptoms || [])[0] || {}).refs?.[0]);
  const btns = [];
  if (href) btns.push(el('a', { class: 'ai-btn primary', href, text: t.service ? '타임머신 A·B 비교 →' : '실행 화면 →' }));
  else if (firstAlert && firstAlert.alert && ctx.alertHref) btns.push(el('a', { class: 'ai-btn primary', href: ctx.alertHref(firstAlert.alert), text: `${TARGET_TEXT[firstAlert.alert.kind] || '대상 화면'} →` }));
  if (t) btns.push(el('button', { type: 'button', class: 'ai-btn', text: '분석 상세', title: '원인 분석 단계(대상 식별 → 비교 구간 → 프로파일 비교 → 콜스택)와 근거', onclick: () => ctx.onTrace && ctx.onTrace(t.alert_id) }));
  if (checks.length || btns.length) {
    cols.push(el('section', { class: 'ab-col ab-act' }, el('h4', { text: '권장 조치' }),
      checks.length ? el('ol', { class: 'ab-checks' }, ...checks.map((c) => el('li', { text: c }))) : null,
      btns.length ? el('div', { class: 'ab-btns' }, ...btns) : null));
  }
  const grid = cols.length ? el('div', { class: `ab-grid n${cols.length}${t ? ' has-cause' : ''}` }, ...cols) : null;

  // 기타 이슈: 대표 이슈 밖의 진행 중 이상, 칩 하나씩
  const oth = v.others.length ? el('div', { class: 'ab-others' },
    el('span', { class: 'ab-ol' }, '기타 이슈 ', el('b', { class: 'num', text: String(v.others.length) })),
    ...v.others.map((o) => linkOr(refHref(o.refs, ev, tctx), { class: `ab-chip lv-${o.level || 'ok'}`, title: o.text }, levelIcon(o.level || 'ok'),
      el('span', { text: o.text })))) : null;

  const card = el('section', { class: `ai-brief lv-${lv}`, 'aria-label': `AI 상황 브리핑: ${LEVEL_TEXT[lv] || lv} ${v.title}` },
    el('div', { class: 'ai-h' },
      el('span', { class: 'ai-mark', text: AI_MARK }), el('h2', { text: 'AI 상황 브리핑' }), badgeEl(b.by, b.ai),
      el('span', { class: 'grow' }),
      el('span', { class: 'ai-at', text: atText, title: atTitle }),
      info('이음이 알림 · 장애 위험도 · 서버 · 배치 · CPU 프로파일을 모아(근거) 대표 이슈를 고르고, 현상 · 추정 원인 · 권장 조치로 나눠 보인다. 칸의 줄을 누르면 그 근거 화면으로 간다. AI는 같은 근거로 제목과 판단 문장만 쓰고(✦, 끝의 칩이 근거), LLM이 없거나 답이 근거와 맞지 않으면 규칙 기반 글을 보인다')),
    status, judge, grid, oth);
  keepFocus(slot, () => slot.replaceChildren(card));
  // 처음 그릴 때와 AI가 새로 쓴 글은 타자 효과로(같은 글을 값 · 상태만 바꿔 다시 그릴 때는 그대로)
  const text = JSON.stringify([v.title, v.judge.map((l) => l.text)]);
  if (first || (b.by === 'llm' && slot.dataset.text !== text)) typeIn([titleEl, ...card.querySelectorAll('.ab-judge .ab-jt')]);
  slot.dataset.text = text;
}

// 추정 원인 칸: 원인 후보 함수 · Self CPU 점유율 A → B · 콜스택 · 유발 요인. 결론 문장은 쓰지 않는다(이 칸이 결론이다).
function causeCol(t) {
  const conf = t.diag && t.diag.confidence;
  const kids = [el('h4', {}, '추정 원인', conf && t.state === 'ok' ? el('span', { class: `ab-conf ${conf}`, title: '판단 근거의 강도: 점유율 변화 폭과 두 구간 표본 수', text: CONF_TEXT[conf] || conf }) : null)];
  if (t.state === 'collecting' || !t.top) { // 수집 중, 또는 점유율이 바뀐 함수가 없음(판단 문장: CPU 밖 원인 의심)
    const note = t.state === 'collecting' ? 'B 구간 CPU 프로파일 샘플 수집 중 — 알림 후 약 50초 안에 함수 비교' : (t.diag && t.diag.title) || DASH;
    kids.push(el('p', { class: 'ab-wait', text: note }));
    return el('section', { class: 'ab-col ab-cause' }, ...kids);
  }
  const top = t.top;
  const a = t.compared ? top.pct_a : 0, bb = top.pct_b;
  // 변화가 작으면(규칙과 같은 3%p 미만) 원인 후보라 부르지 않고 판단 문장(CPU 밖 원인 의심)을 함께 보인다
  const weak = t.compared && top.diff < 3;
  kids.push(el('div', { class: 'ab-fn' }, el('code', { text: top.leaf }), el('span', { class: 'ab-fnk', text: weak ? '최대 증가 함수' : '원인 후보 함수' })));
  if (weak && t.diag && t.diag.title) kids.push(el('p', { class: 'ab-wait', text: t.diag.title }));
  const kv = el('dl', { class: 'ab-kv' });
  kv.append(el('dt', { text: 'Self CPU' }), el('dd', {},
    el('span', { class: 'num', text: t.compared ? `${pctText(a)} → ${pctText(bb)}` : `B ${pctText(bb)}` }),
    t.compared ? el('b', { class: 'ab-up num', text: ppText(top.diff) }) : null,
    el('span', { class: 'ab-bars', title: `A(기준) ${pctText(a)} · B(이상) ${pctText(bb)}` },
      el('i', { class: 'a', style: `width:${Math.min(100, a).toFixed(1)}%` }), el('i', { class: 'b', style: `width:${Math.min(100, bb).toFixed(1)}%` }))));
  const path = t.path || [];
  if (path.length > 1) kv.append(el('dt', { text: '콜스택' }), el('dd', { class: 'ab-path', title: path.join(' › ') }, ...pathEls(path.slice(-3))));
  if (t.trigger) kv.append(el('dt', { text: '유발 요인' }), el('dd', { class: 'num', text: t.trigger }));
  else if (t.metric) kv.append(el('dt', { text: '동시간대' }), el('dd', { class: 'num', text: t.metric }));
  kids.push(kv);
  return el('section', { class: 'ab-col ab-cause' }, ...kids);
}

function pathEls(path) {
  const out = [];
  path.forEach((f, i) => {
    if (i) out.push(el('i', { text: '›' }));
    out.push(el(i === path.length - 1 ? 'b' : 'span', { text: f }));
  });
  return out;
}

// ---- 원인 분석 서랍 ----

// 알림 하나의 원인 분석을 서랍에 연다. 끝나지 않았거나 AI가 쓰는 중이면 3초마다 다시 묻는다. ctx {alertHref(a)}
export function openTrace(alertId, ctx = {}) {
  const d = openDrawer(`${AI_MARK} 원인 분석`);
  document.getElementById('drawer')?.classList.add('at-drawer');
  d.body.replaceChildren(el('p', { class: 'empty', text: '근거를 모으는 중…' }));
  let lastSig = '';
  const stop = poll(async () => {
    if (!d.body.isConnected) { stop(); return; }
    let t;
    try { t = await api(`/alerts/${enc(alertId)}/trace`); } catch (e) {
      d.body.replaceChildren(el('p', { class: 'empty', text: e.status === 404 ? '없는 알림' : '원인 분석을 불러오지 못함' }));
      stop();
      return;
    }
    const sig = JSON.stringify([t.state, t.final, t.a, t.b, t.top, t.diag, t.ai, t.alert && t.alert.state]);
    if (sig !== lastSig) {
      lastSig = sig;
      keepFocus(d.body, () => d.body.replaceChildren(traceView(t, ctx))); // 3초 갱신이 포커스를 날리지 않게
    }
    if (t.final && !['pending', 'wait'].includes((t.ai || {}).state)) stop();
  }, 3000);
}

function step(n, title, ...body) {
  return el('li', { class: 'ts' }, el('span', { class: 'ts-n', text: String(n) }),
    el('div', { class: 'ts-b' }, el('div', { class: 'ts-t', text: title }), ...body.filter(Boolean)));
}

export function traceView(t, ctx = {}) {
  const ev = new Map((t.evidence || []).map((e) => [e.id, e]));
  const tctx = { ...ctx, trace: t };
  const a = t.alert || {};
  const href = traceHash(t);
  const box = el('div', { class: 'at-view' });
  const status = t.state === 'collecting' ? '샘플 수집 중' : t.final ? '분석 완료' : '계산 중';
  box.append(el('div', { class: 'at-top' }, badgeEl(t.diag && t.diag.by, t.ai), el('span', { class: 'grow' }),
    el('span', { class: 'ai-at', text: `${status} · ${fmtClock(t.at)}` })));

  const steps = [];
  steps.push(step(1, '알림',
    el('div', { class: 'ts-line' }, el('span', { class: `ts-lv ${esc(a.level)}` }, levelIcon(a.level), LEVEL_TEXT[a.level] || a.level || DASH), ' ', a.message || DASH),
    el('div', { class: 'ts-sub', text: `${fmtClock(a.ts)} 발생${a.state === 'resolved' ? ` · ${fmtClock(a.resolved_at)} 해소` : ' · 진행 중'}` })));
  if (t.state === 'exit' || t.state === 'no_owner' || t.state === 'down') { // 함수 비교를 하지 않는 추적: 구간·표 대신 갈 곳만
    steps.push(step(2, '분석 경로', el('div', { class: 'ts-line', text: t.note || DASH }),
      t.state === 'exit' && a.dedup_key ? el('a', { href: `#exit/${enc(String(a.dedup_key).replace(/^exit:/, ''))}`, onclick: closeDrawer, text: '종료 보고서 →' }) : null));
  } else {
    const who = [t.service_title || t.service, t.host].filter(Boolean).join(' · ') || t.owner;
    steps.push(step(2, '대상 식별', el('div', { class: 'ts-line' }, el('b', { text: who })),
      el('div', { class: 'ts-sub', text: [t.owner, t.found].filter(Boolean).join(' · ') })));
    steps.push(step(3, '비교 구간',
      el('div', { class: 'ts-ab' },
        el('span', { class: 'tm-chip a set' }, el('b', { text: 'A' }), el('span', { class: 'cn', text: '기준' }),
          el('span', { class: 'cv num', text: t.a && t.a.samples ? `${fmtClock(t.a.from)}–${fmtClock(t.a.to)} · 샘플 ${fmtNum(t.a.samples)}` : '샘플 없음' })),
        el('span', { class: 'tm-chip b set' }, el('b', { text: 'B' }), el('span', { class: 'cn', text: '이상' }),
          el('span', { class: 'cv num', text: `${fmtClock(t.b.from)}–${fmtClock(t.b.to)} · 샘플 ${fmtNum(t.b.samples)}` }))),
      el('div', { class: 'ts-sub', text: 'A 알림 −5분~−90초 · B 알림 ±30초', title: 'A 구간 샘플이 부족하면 B 직전까지 넓힌다' })));
    if (t.state === 'collecting' || t.state === 'no_profile') {
      steps.push(step(4, '프로파일 비교', el('div', { class: 'ts-line', text: t.note || DASH })));
    } else {
      const max = Math.max(1, ...(t.functions || []).map((r) => Math.abs(r.diff)));
      const rows = (t.functions || []).map((r) => el('tr', { class: t.top && r.leaf === t.top.leaf ? 'on' : '' },
        el('td', { class: 'fn' }, el('code', { text: r.leaf })),
        el('td', { class: 'num', text: t.compared ? pctText(r.pct_a) : DASH }), el('td', { class: 'num', text: pctText(r.pct_b) }),
        el('td', { class: `num ${r.diff > 0 ? 'up' : 'down'}`, text: t.compared ? ppText(r.diff) : DASH }),
        el('td', {}, el('span', { class: `tm-cbar ${r.diff > 0 ? 'up' : 'down'}`, style: `width:${Math.round((Math.abs(r.diff) / max) * 100)}%` }))));
      steps.push(step(4, '프로파일 비교(Self CPU 점유율)',
        el('table', { class: 'tm-cmp-t at-tbl' }, el('thead', {}, el('tr', {}, ...['함수', 'A', 'B', '변화', ''].map((h) => el('th', { text: h })))), el('tbody', {}, ...rows))));
      if ((t.path || []).length) {
        steps.push(step(5, '콜스택', el('div', { class: 'at-path big' }, ...pathEls(t.path)),
          el('div', { class: 'ts-sub', text: `B 구간 최빈 스택 · 샘플의 ${pctText(t.path_pct)}` })));
      }
    }
    const facts = [];
    for (const m of t.metrics || []) {
      const e = ev.get('metric:' + m.name);
      facts.push(el('li', {}, el('b', { text: m.title }), ' ', (e && e.lines && e.lines[0]) || ''));
    }
    if (t.log_count) facts.push(el('li', {}, el('b', { text: `오류·경고 로그 ${fmtNum(t.log_count)}건` }), ' ', (t.logs[0] && t.logs[0].message) || ''));
    for (const x of t.audit || []) facts.push(el('li', {}, el('b', { text: '운영자 조작' }), ` ${fmtClock(x.ts)} ${String(x.actor || '').replace(/^user:/, '')} ${x.action} ${x.target}`));
    if (facts.length) steps.push(step(steps.length + 1, '동시간대 지표·로그', el('ul', { class: 'ts-facts' }, ...facts)));
  }
  box.append(el('ol', { class: 'at-steps' }, ...steps));

  // 분석(AI 초안 또는 규칙)
  const dg = t.diag || {};
  const judge = el('section', { class: `at-judge ${dg.by === 'llm' ? 'llm' : 'rule'}` },
    el('div', { class: 'aj-h' }, el('span', { class: 'ai-mark', text: AI_MARK }), el('b', { text: dg.by === 'llm' ? 'AI 분석' : '규칙 기반 분석' }),
      dg.confidence ? el('span', { class: `aj-conf ${dg.confidence}`, text: CONF_TEXT[dg.confidence] || dg.confidence }) : null,
      el('span', { class: 'grow' }), badgeEl(dg.by, t.ai)),
    el('p', { class: 'aj-t', text: dg.title || DASH }),
    dg.detail ? el('p', { class: 'aj-d', text: dg.detail }) : null,
    (dg.evidence_ids || []).length ? el('div', { class: 'aj-ev' }, el('span', { class: 'aj-l', text: '근거' }), chips(dg.evidence_ids, ev, tctx)) : null,
    (dg.next_checks || []).length ? el('div', { class: 'ai-next' }, el('b', { text: '권장 조치' }), el('ol', {}, ...dg.next_checks.map((c) => el('li', { text: c })))) : null);
  if (dg.by === 'llm' && t.rule) {
    judge.append(el('details', { class: 'aj-rule' }, el('summary', { text: '같은 근거의 규칙 기반 분석' }),
      el('p', { class: 'aj-t', text: t.rule.title }), el('p', { class: 'aj-d', text: t.rule.detail || '' })));
  }
  if (t.ai && t.ai.state === 'error') judge.append(el('p', { class: 'aj-err', text: `AI 답을 쓰지 못함: ${t.ai.error || ''}` }));
  box.append(judge);

  box.append(el('div', { class: 'at-act' },
    href ? el('a', { class: 'ai-btn primary', href, onclick: closeDrawer, text: t.state === 'down' ? '서비스 타임머신 →' : t.service ? '타임머신에서 A·B 비교 열기 →' : '실행 화면 →' }) : null,
    ctx.alertHref && a.kind ? el('a', { class: 'ai-btn', href: ctx.alertHref(a), onclick: closeDrawer, text: '알림 화면 →' }) : null));
  // 칩을 눌러 다른 화면으로 가면 서랍을 닫는다
  box.querySelectorAll('a.ai-ref').forEach((x) => x.addEventListener('click', closeDrawer));
  return box;
}
