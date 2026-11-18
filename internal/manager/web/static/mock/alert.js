// 알림 · 장애 위험 · 장애 기록
import { MIN, SEC, HOUR, KST, fmtN, fmtKst } from './util.js';
import { FEATURE_TITLE, CHECK, BASELINE, holdsOf, liveHolds, autoRelease, openIndex, openAt, makeHold, stats as holdStats } from './riskhold.js';
import { hostsView, isDead } from './world.js';
import { bizAt, riskAt, serviceAt, surgeRef, surgeStart } from './signal.js';
import { logEvents } from './biz.js';
import { flowOf } from './world.js';
import { IDS as EXIT_IDS } from './exit.js';
import { shapeFor, profileSplit } from './core.js';
import { LITE, DEMO, SUMMIT } from './profile.js';
import { userId } from './auth.js';

const ok = (body, status = 200) => ({ status, body });
const err = (status, msg) => ({ status, body: { error: msg } });
const num = (v) => (v === null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));
const actor = 'user:web(127.0.0.1)';
// 시연판: 알림 확인 · 위험 요인 표시에 남는 '누가'는 로그인한 사용자(감사 기록의 '누가'는 index.js · audit.js가 맞춘다)
const who = () => (SUMMIT ? `user:${userId()}` : actor);

const FEATURES = ['cpu_max', 'mem_max', 'hosts_hot', 'queue', 'p99', 'lag', 'log_errors', 'runs_failed'];
const RULE_W = [1, 1, 1, 2, 2, 1, 2, 1];
const LOGREG_W = [0.4, 0.2, 0.5, 1.1, 0.9, 0.6, 0.7, 0.3];
const weights = (arr) => Object.fromEntries(FEATURES.map((f, i) => [f, arr[i]]));

const groupOfHost = (c, id) => (c.w.hosts.find((h) => h.id === id) || { group: '' }).group;
// 세계에 있는 서버인지(체험판은 9대뿐이라 없는 서버를 가리키는 알림 · 위험 요인을 내지 않는다)
const hasHost = (c, id) => c.w.hosts.some((h) => h.id === id);

// 지금 조건에서 나오는 알림 전부(firing·resolved). id는 조건마다 고정.
function buildAlerts(c) {
  const out = [];
  const { now, w } = c;
  const hv = hostsView(w, c.sig);
  const mk = (a) => ({ resolved_at: 0, acked_at: 0, acked_by: '', value: 0, exec_id: '', host: '', group: '', name: '', ...a });
  const dw = hv.find((h) => h.id === 'dw-02');
  if (dw && dw.state === 'crit') {
    out.push(mk({ id: 1, ts: w.base - 40 * MIN, kind: 'host', dedup_key: 'host:dw-02', level: 'crit', state: 'firing', host: 'dw-02', group: dw.group, name: 'host.mem.used_pct', value: dw.mem, message: `dw-02 · 메모리 ${Math.round(dw.mem)}% (위험 90%)` }));
  }
  if (hasHost(c, 'ext-04')) out.push(mk({ id: 2, ts: now - 170 * SEC, kind: 'host', dedup_key: 'host:ext-04', level: 'crit', state: 'firing', host: 'ext-04', group: groupOfHost(c, 'ext-04'), name: '', message: 'ext-04 · 무응답' }));
  // 실행 실패: 재시도가 남지 않은 최신 시도
  for (const r of w.runs) {
    const flow = flowOf(w, r.flow_id);
    if (!flow) continue;
    const latest = w.runs.filter((x) => x.flow_run_id === r.flow_run_id && x.step_id === r.step_id).reduce((a, b) => (b.attempt > a.attempt ? b : a));
    const isExt = r === w.extFail;
    if (latest !== r && !isExt) continue;
    const dead = latest === r && isDead(r, flow);
    if (!dead && !isExt) continue;
    // 시연판: 끝난 지 24시간(세계를 만든 때 기준)이 넘은 실행의 실패 알림은 내지 않는다(실행 이력 격자의 실패 칸은 그대로)
    if (SUMMIT && !isExt && r.ended_at && r.ended_at < w.base - 24 * HOUR) continue;
    const id = isExt ? 3 : 1000 + r.seq;
    const lastEv = r.events[r.events.length - 1];
    out.push(mk({
      id, ts: r.ended_at || now, kind: 'run', dedup_key: `run:${r.exec_id}`, level: 'crit', state: dead ? 'firing' : 'resolved',
      host: r.host, group: groupOfHost(c, r.host), name: `${r.flow_id}/${r.step_id}`, exec_id: r.exec_id,
      message: `${r.flow_id} · ${r.step_id} 실행 ${r.status === 'KILLED' ? '종료됨' : '실패'} (시도 ${r.attempt})`,
      resolved_at: dead ? 0 : lastEv.ts,
    }));
  }
  if (c.sig.surge) {
    const m1 = hv.find((h) => h.id === 'match-01');
    const ex = { ...c.sig, exact: true };
    const b = bizAt(now, ex);
    const execId = w.startRun.exec_id;
    const ref = surgeRef(c.sig); // 폭주 기준 시각: full은 지금, 체험판은 base(알림 시각이 머문 만큼 밀리지 않는다)
    if (m1 && m1.state !== 'ok') out.push(mk({ id: 11, ts: ref - 210 * SEC, kind: 'host', dedup_key: 'host:match-01', level: m1.state, state: 'firing', host: 'match-01', group: m1.group, name: 'host.cpu.pct', value: m1.cpu, message: `match-01 · CPU ${Math.round(m1.cpu)}% (경고 70%)` }));
    out.push(mk({ id: 12, ts: ref - 33 * SEC, kind: 'tile', dedup_key: 'tile:matching/대기 큐', level: 'crit', state: 'firing', group: '매매체결', name: 'biz.order.queue', exec_id: execId, value: b['biz.order.queue'], message: `체결 · 대기 큐 ${fmtN(b['biz.order.queue'])}건 (위험 2,000)` }));
    out.push(mk({ id: 13, ts: ref - 82 * SEC, kind: 'tile', dedup_key: 'tile:matching/RT p99', level: 'crit', state: 'firing', group: '매매체결', name: 'biz.order.latency_p99_ms', exec_id: execId, value: b['biz.order.latency_p99_ms'], message: `체결 · RT p99 ${fmtN(b['biz.order.latency_p99_ms'])}ms (위험 200)` }));
    const n = logEvents(c, { levels: ['error'], host: 'match-01', from: ref - 150 * SEC, to: ref, limit: 2000 }).length;
    out.push(mk({ id: 14, ts: ref - 80 * SEC, kind: 'log', dedup_key: 'log:match-01:matching', level: 'crit', state: 'firing', host: 'match-01', group: '매매체결', name: 'log.error.count', exec_id: execId, value: n, message: `match-01 · matching (E) 로그 ${n}건` }));
    if (!DEMO) out.push(mk({ id: 15, ts: now - 50 * SEC, kind: 'exit', dedup_key: `exit:${EXIT_IDS.crash}`, level: 'crit', state: 'resolved', host: 'match-01', group: '매매체결', name: 'matching_svc', exec_id: execId, message: 'matching_svc 종료 · match-01 — book_insert에서 NULL 역참조(주소 0x8)', resolved_at: now - 50 * SEC + MIN }));
  }
  // 시연판: 벤더 패널의 위험 타일 둘(1분 시세량 하한 · 호가 갱신 값 끊김)에도 알림을 낸다. 문구는 매니저 alert.go tileMessage 꼴이고,
  // 값 · 시각은 그 타일의 계열(core.js: base − 6분에 떨어짐, base − 45초부터 값 끊김)이 기준을 넘긴 때의 것이다. 로그 경로에 {exec_id}가 없어 실행 ID는 없다
  if (SUMMIT && hasHost(c, 'feed-03') && hasHost(c, 'feed-02')) {
    out.push(mk({ id: 16, ts: w.base - 6 * MIN + 10 * SEC, kind: 'tile', dedup_key: 'tile:vendor/1분 시세량', level: 'crit', state: 'firing', host: 'feed-03', group: '정보분배', name: 'biz.vendor.count_1m', value: 4550, message: '정보 벤더 시세 · 1분 시세량 4,550건/분 · feed-03 (위험 하한 10,000)' }));
    out.push(mk({ id: 17, ts: w.base - 15 * SEC, kind: 'tile', dedup_key: 'tile:vendor/호가 갱신', level: 'crit', state: 'firing', host: 'feed-02', group: '정보분배', name: 'biz.vendor.depth_1m', message: '정보 벤더 시세 · 호가 갱신 값 끊김 30초 · feed-02 (기준 30초)' }));
  }
  // 체험판: 종료 알림은 시간표의 그 종료(base − 126분, w.crashRun이 띄운 matching_svc)에 맞춘다. 해소 = 체결 서비스가 다시 뜬 때
  const dead = DEMO && w.crashRun ? w.procs.find((p) => p.exit_id === EXIT_IDS.crash) : null;
  if (dead) {
    const again = w.procs.find((p) => p.exec_id === w.startRun.exec_id && p.service === 'matching' && !p.leader);
    out.push(mk({ id: 15, ts: dead.ended_at, kind: 'exit', dedup_key: `exit:${EXIT_IDS.crash}`, level: 'crit', state: 'resolved', host: dead.host, group: groupOfHost(c, dead.host), name: 'matching_svc', exec_id: w.crashRun.exec_id, message: `matching_svc 종료 · ${dead.host} — book_insert에서 NULL 역참조(주소 0x8)`, resolved_at: again ? again.started_at : w.startRun.started_at }));
  }
  if (hasHost(c, 'match-04')) out.push(mk({ id: 21, ts: w.base - 5 * 3600000, kind: 'host', dedup_key: 'host:match-04', level: 'warn', state: 'resolved', host: 'match-04', group: '매매체결', name: 'host.cpu.pct', value: 72, message: 'match-04 · CPU 72% (경고 70%)', resolved_at: w.base - 5 * 3600000 + 8 * MIN }));
  if (!LITE) out.push(mk({ id: 22, ts: w.base - 26 * 3600000, kind: 'tile', dedup_key: 'tile:matching/히스토리 버퍼 사용률', level: 'warn', state: 'resolved', group: '매매체결', name: 'biz.order.histbuf_pct', value: 74, message: '체결 · 히스토리 버퍼 사용률 74% (경고 70%)', resolved_at: w.base - 26 * 3600000 + 12 * MIN }));
  // 같은 알림이 되풀이되는 모양(화면에서 ×N으로 묶임). 진행 중 묶음은 실행 실패(시도 N)가 이미 보여 주므로
  // 해소된 것만 더한다(종 숫자·관제 이벤트 수를 시연 이야기 밖으로 늘리지 않게)
  for (let i = 1; !DEMO && i <= 2; i++) { // 시연판 · 체험판은 확인한 알림 수 그대로 둔다
    out.push(mk({ id: 40 + i, ts: w.base - (7 + i) * 3600000, kind: 'host', dedup_key: `host:match-04:cpu${i}`, level: 'warn', state: 'resolved', host: 'match-04', group: '매매체결', name: 'host.cpu.pct', value: 72, message: 'match-04 · CPU 72% (경고 70%)', resolved_at: w.base - (7 + i) * 3600000 + 6 * MIN }));
  }
  for (const a of out) {
    const k = w.acks.get(a.id);
    if (k) {
      a.acked_at = k.at;
      a.acked_by = k.by;
    }
  }
  return out;
}

function alerts(c) {
  const st = c.q.get('state') || 'firing';
  const kinds = c.q.get('kind') ? c.q.get('kind').split(',') : null;
  const since = num(c.q.get('since'));
  const limit = num(c.q.get('limit')) || 100;
  const list = buildAlerts(c)
    .filter((a) => (st === 'all' || a.state === st) && (!kinds || kinds.includes(a.kind)) && a.ts >= since)
    .sort((a, b) => (a.state === b.state ? 0 : a.state === 'firing' ? -1 : 1) || b.ts - a.ts)
    .slice(0, limit);
  return ok({ alerts: list });
}

function ack(c, m) {
  const id = Number(m[1]);
  const a = buildAlerts(c).find((x) => x.id === id);
  if (!a) return err(404, '알림을 찾을 수 없음');
  if (!c.w.acks.has(id)) {
    c.w.acks.set(id, { at: c.now, by: who() });
    // 체험판: 알림 확인도 감사 기록에 남긴다(매니저 alert.go ackDetail과 같은 글: 이름 @서버)
    if (DEMO) c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'alert.ack', target: String(id), detail: (a.name || a.message) + (a.host ? ` @${a.host}` : '') });
  }
  return ok({ ok: true });
}

// ---- 위험 지수 ----

const levelOf = (v) => (v < 30 ? 'ok' : v < 60 ? 'warn' : 'crit');

function riskView(c) {
  const { now, w } = c;
  const idx = riskAt(now, { ...c.sig, exact: true });
  const rule = c.flags.rule;
  const labels = w.incidents.filter((i) => i.source !== 'auto' || i.confirmed);
  const incidents = rule ? 2 : labels.length;
  const unconfirmed = w.incidents.length - labels.length;
  // 양성 = 라벨 기록마다 직전 5분, 뺀 창 = 장애 중(끝 창 포함) + 확인 전 자동 기록의 직전 5분
  const positives = labels.length * 5;
  const excluded = w.incidents.reduce((n, i) => n + Math.round((i.end - i.start) / MIN) + 1, 0) + unconfirmed * 5;
  const hv = hostsView(w, c.sig);
  const hostVal = (id, k) => { const h = hv.find((x) => x.id === id); return h ? h[k] : 0; };
  let factors;
  if (c.sig.surge) {
    const nErr = logEvents(c, { levels: ['error'], host: 'match-01', from: now - MIN, limit: 2000 }).length;
    const b = bizAt(now, { ...c.sig, exact: true });
    const q = b['biz.order.queue'], p99 = b['biz.order.latency_p99_ms'], cpu = Math.round(hostVal('match-01', 'cpu'));
    factors = [
      { feature: 'queue', value: q, contrib: 1.9, where: [{ kind: 'host', id: 'match-01', label: '', value: q }] },
      { feature: 'p99', value: p99, contrib: 1.2, where: [{ kind: 'host', id: 'match-01', label: '', value: p99 }] },
      { feature: 'log_errors', value: nErr, contrib: 0.9, where: [{ kind: 'log', id: 'match-01', label: 'matching', value: nErr }] },
      { feature: 'cpu_max', value: cpu, contrib: 0.4, where: [{ kind: 'host', id: 'match-01', label: '', value: cpu }, { kind: 'host', id: 'match-03', label: '', value: Math.round(hostVal('match-03', 'cpu')) }] },
      { feature: 'mem_max', value: 93, contrib: 0.3, where: [{ kind: 'host', id: 'dw-02', label: '', value: 93 }] },
    ];
  } else {
    factors = [
      { feature: 'mem_max', value: 93, contrib: 0.6, where: [{ kind: 'host', id: 'dw-02', label: '', value: 93 }] },
      { feature: 'cpu_max', value: 31, contrib: 0.2, where: [{ kind: 'host', id: 'match-01', label: '', value: 31 }] },
    ];
  }
  const incs = incidentList(c);
  holdsOf(w, incs);
  if (c.flags.hold && !w.holdFlagDone) {
    w.holdFlagDone = true;
    for (const name of c.flags.hold.split(',')) {
      const f = factors.find((x) => x.feature === name.trim());
      if (f) w.holds.unshift({ id: w.holdSeq++, feature: f.feature, kind: 'accept', reason: '장 마감 직전 주문 몰림 — 처리 정상 확인', value: f.value, limit: Math.round(f.value * 120) / 100,
        at: now - 6 * MIN, by: 'user:operator', until: now + 4 * 3600000 - 6 * MIN, ended_at: 0, ended_by: '', end_note: '' });
    }
  }
  for (const f of factors) f.where = f.where.filter((x) => x.kind !== 'host' || hasHost(c, x.id)); // 세계에 없는 서버는 뺀다
  autoRelease(c, factors);
  const live = liveHolds(w);
  const holdOf = new Map(live.map((h) => [h.feature, h]));
  factors = factors.map((f) => ({
    feature: f.feature, title: FEATURE_TITLE[f.feature], value: f.value, contrib: f.contrib,
    baseline: BASELINE[f.feature], check: CHECK[f.feature], where: f.where, hold: holdOf.get(f.feature) || null,
  }));
  const open = openIndex(idx, factors, live);
  const accepts = live.filter((h) => h.kind === 'accept');
  w.openRatio = accepts.length && idx > 0 ? { since: Math.min(...accepts.map((h) => h.at)), ratio: open / idx } : null;
  const history = [];
  for (let t = Math.floor((now - 3600000) / 10000) * 10000; t <= now; t += 10000) history.push([t, riskAt(t, c.sig)]);
  return {
    now,
    index: idx,
    level: levelOf(idx),
    open_index: open,
    open_level: levelOf(open),
    mode: rule ? 'rule' : 'model',
    model: rule
      ? { kind: 'rule', trained_at: 0, windows: 0, positives: 0, incidents, unconfirmed, excluded: 0, auc: 0, lead_sec: 300, weights: weights(RULE_W), prior_offset: 0, false_warn: 0.18, hit_warn: 0.64 }
      : { kind: 'logreg', trained_at: w.trainedAt, windows: 10080 - excluded, positives, incidents, unconfirmed, excluded, auc: 0.91, lead_sec: 300, weights: weights(LOGREG_W), prior_offset: 5.8, false_warn: 0.012, hit_warn: 0.66 },
    factors,
    holds: live,
    incidents: incs.filter((i) => !i.end).sort((a, b) => b.start - a.start),
    note: rule ? `규칙 기반 · 학습 사례 부족(장애 ${incidents}건, 최소 3건${unconfirmed ? ` · 확인 안 된 자동 기록 ${unconfirmed}건은 빼고 셈` : ''})` : '',
    history,
    history_open: history.map(([t, v]) => [t, openAt(w, t, v)]),
  };
}

function risk(c) {
  return ok(riskView(c));
}

// 감사 기록의 학습 줄(매니저 risk/api.go와 같은 글)
export const trainDetail = (mode, m) => `mode=${mode} kind=${m.kind} windows=${m.windows} positives=${m.positives} incidents=${m.incidents} auc=${Number(m.auc).toFixed(3)}`;
// 시연판 감사 기록 씨앗(audit.js)용: 세계를 만든 때의 장애 기록으로 셈한 모델 칸(riskView와 같은 계산)
export function seedModel(w) {
  const all = w.incidents.filter((i) => i.source === 'seed' || i.source === 'auto');
  const labels = all.filter((i) => i.source !== 'auto' || i.confirmed);
  const unconfirmed = all.length - labels.length;
  const excluded = all.reduce((n, i) => n + Math.round((i.end - i.start) / MIN) + 1, 0) + unconfirmed * 5;
  return { kind: 'logreg', windows: 10080 - excluded, positives: labels.length * 5, incidents: labels.length, auc: 0.91 };
}

function train(c) {
  const v = riskView(c);
  if (!c.flags.rule) c.w.trainedAt = c.now;
  const m = v.model;
  // 시연판: '지금 학습'도 감사 기록에 남긴다
  if (SUMMIT) c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'risk.train', target: 'risk', detail: trainDetail(v.mode, m) });
  return ok({ kind: m.kind, trained_at: c.flags.rule ? c.now : c.w.trainedAt, windows: m.windows, positives: m.positives, incidents: m.incidents, unconfirmed: m.unconfirmed, excluded: m.excluded, auc: m.auc, weights: m.weights, mode: v.mode, note: v.note });
}

// ---- 위험 요인 확인 표시 ----

const hhmm = (ts) => fmtKst(ts).slice(0, 5);

function listHolds(c) {
  const to = num(c.q.get('to')) || c.now;
  const from = num(c.q.get('from')) || to - 7 * 86400000;
  if (from >= to) return err(400, 'from은 to보다 앞이어야 함');
  const incs = incidentList(c);
  const holds = holdsOf(c.w, incs).filter((h) => h.at < to && (h.ended_at || to) >= from).sort((a, b) => b.at - a.at);
  return ok({ holds, stats: holdStats(c.w, from, to, incs), from, to });
}

function addHold(c) {
  const v = riskView(c);
  const r = makeHold(c, c.json(), v.factors, who());
  if (r.error) return err(400, r.error);
  const h = r.hold;
  for (const x of liveHolds(c.w)) {
    if (x.feature === h.feature) Object.assign(x, { ended_at: c.now, ended_by: who(), end_note: '바꿈' });
  }
  c.w.holds.unshift(h);
  const t = FEATURE_TITLE[h.feature];
  c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: `risk.${h.kind}`, target: `risk:${h.feature}`,
    detail: `${t} ${fmtN(h.value)} · 한도 ${fmtN(h.limit)} · ~${hhmm(h.until)}${h.reason ? ` · 사유: ${h.reason}` : ''}` });
  return ok(h, 201);
}

function releaseHold(c, m) {
  const id = Number(m[1]);
  const h = holdsOf(c.w).find((x) => x.id === id && !x.ended_at);
  if (!h) return err(404, '확인 표시를 찾을 수 없음');
  Object.assign(h, { ended_at: c.now, ended_by: who(), end_note: '해제' });
  c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'risk.release', target: `risk:${h.feature}`, detail: `${FEATURE_TITLE[h.feature]} #${h.id}` });
  return { status: 204, body: null };
}

// ---- 장애 기록 ----

function tsOf(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).trim();
  if (/^\d{10,}$/.test(s)) return Number(s);
  let m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - KST;
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

function incidentList(c) {
  const list = c.w.incidents.map((i) => ({ ...i }));
  if (c.sig.surge) list.push({ id: 1000, start: surgeRef(c.sig) - 210 * SEC, end: 0, scope: '매매체결', title: '자동: 체결 · 대기 큐 위험', source: 'auto', note: '', confirmed: !!c.w.surgeConfirmed });
  return list;
}

function incidents(c) {
  const to = num(c.q.get('to')) || c.now;
  const from = num(c.q.get('from')) || to - 30 * 86400000;
  const list = incidentList(c)
    .filter((i) => i.start <= to && (i.end === 0 || i.end >= from))
    .sort((a, b) => b.start - a.start);
  return ok({ incidents: list });
}

function addIncident(c) {
  const b = c.json() || {};
  const start = tsOf(b.start);
  const end = b.end ? tsOf(b.end) : 0;
  if (!start || Number.isNaN(start)) return err(400, '시작 시각이 필요');
  if (Number.isNaN(end)) return err(400, '끝 시각 형식이 올바르지 않음');
  if (!String(b.title || '').trim()) return err(400, '제목이 필요');
  const inc = { id: c.w.incSeq++, start, end, scope: String(b.scope || ''), title: String(b.title).trim(), source: 'manual', note: String(b.note || ''), confirmed: false };
  c.w.incidents.push(inc);
  c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'incident.create', target: String(inc.id), detail: inc.title });
  return ok({ id: inc.id }, 201);
}

function patchIncident(c, m) {
  const id = Number(m[1]);
  const b = c.json() || {};
  if (id === 1000 && c.sig.surge) { // 진행 중 자동 기록(mock 시나리오)
    if (b.confirmed !== undefined) c.w.surgeConfirmed = !!b.confirmed;
    return ok({ ok: true });
  }
  const inc = c.w.incidents.find((i) => i.id === id);
  if (!inc) return err(404, '장애 기록을 찾을 수 없음');
  if (b.confirmed !== undefined && !!b.confirmed !== !!inc.confirmed) {
    if (inc.source !== 'auto') return err(400, '자동 기록만 확인합니다(직접·가져옴·시연 기록은 이미 학습 라벨)');
    inc.confirmed = !!b.confirmed;
    c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'incident.confirm', target: `incident:${id}`, detail: `${inc.title} · ${inc.confirmed ? '장애로 확인' : '확인 취소'}` });
  }
  if (b.end !== undefined) {
    const e = b.end ? tsOf(b.end) : 0;
    if (Number.isNaN(e)) return err(400, '끝 시각 형식이 올바르지 않음');
    inc.end = e;
  }
  if (b.title !== undefined) inc.title = String(b.title);
  if (b.note !== undefined) inc.note = String(b.note);
  if (b.end !== undefined || b.title !== undefined || b.note !== undefined) c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'incident.update', target: String(id), detail: '' });
  return ok({ ok: true });
}

function importIncidents(c) {
  const lines = c.text().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && /^start\s*,/i.test(lines[i])) continue;
    const p = lines[i].split(',');
    if (p.length < 4) return err(400, `${i + 1}번째 줄: 열이 모자람 (start,end,scope,title)`);
    const start = tsOf(p[0]);
    const end = p[1].trim() ? tsOf(p[1]) : 0;
    if (!start || Number.isNaN(start) || Number.isNaN(end)) return err(400, `${i + 1}번째 줄: 시각 형식이 올바르지 않음`);
    rows.push({ start, end, scope: p[2].trim(), title: p.slice(3).join(',').trim() });
  }
  for (const r of rows) c.w.incidents.push({ id: c.w.incSeq++, ...r, source: 'import', note: '', confirmed: false });
  if (rows.length) c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor, action: 'incident.import', target: '', detail: String(rows.length) });
  return ok({ imported: rows.length });
}

function riskDataset(c) {
  const lines = [['ts', ...FEATURES, 'label'].join(',')];
  for (let i = 0; i < 6; i++) {
    const ts = c.now - (6 - i) * MIN;
    const bad = c.sig.surge && i >= 3;
    lines.push([ts, bad ? 62 : 31, 93, bad ? 1 : 0, bad ? 1400 + i * 200 : 3, bad ? 250 : 4.2, bad ? 600 : 0, bad ? 12 : 0, 0, bad ? 1 : 0].join(','));
  }
  return { status: 200, body: lines.join('\n') + '\n', contentType: 'text/csv; charset=utf-8' };
}

// ---- 관제 AI(GET /brief, GET /alerts/{id}/trace) ----
// 매니저(internal/manager/brief)와 같은 모양. 폭주 장면의 체결 알림(12·13·14)은 book_insert까지 따라가고,
// ?llm=1이면 AI 초안(mock-llm)으로, 아니면 규칙 문장(LLM 미연결)으로 보인다.
const TRACE_IDS = new Set([12, 13, 14, 11]);

// 체험판: 함수 표 · 표본 수 · 호출 경로 · 지표를 프로파일 모양(core.js)과 신호에서 계산한다.
// 같은 A·B 구간으로 /profile을 부른 타임머신 비교표(flame.js compareLeaf · tm.js topChanges)와 같은 숫자가 나온다.
function liteCompare(c, A, B) {
  const prof = (s) => profileSplit(...shapeFor(c, c.w.startRun, s.from, s.to), s.from, s.to);
  const pa = prof(A), pb = prof(B);
  const leafOf = (frames) => frames.split(';').pop();
  const pct = (p, leaf) => (p.samples ? (p.stacks.filter((x) => leafOf(x.frames) === leaf).reduce((n, x) => n + x.samples, 0) / p.samples) * 100 : 0);
  const r1 = (v) => Math.round(v * 10) / 10;
  const fns = [...new Set([...pa.stacks, ...pb.stacks].map((x) => leafOf(x.frames)))]
    .map((leaf) => ({ leaf, a: pct(pa, leaf), b: pct(pb, leaf) }))
    .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))
    .slice(0, 5)
    .map((x) => ({ leaf: x.leaf, pct_a: r1(x.a), pct_b: r1(x.b), diff: r1(x.b - x.a) }));
  const top = fns.reduce((m, f) => (f.diff > m.diff ? f : m), fns[0]);
  const best = pb.stacks.filter((x) => leafOf(x.frames) === top.leaf)[0]; // stacks는 표본 많은 순
  const ex = { ...c.sig, exact: true };
  const stat = (span, f) => {
    let sum = 0, n = 0, max = -Infinity;
    for (let t = span.from; t <= span.to; t += 5 * SEC) { const v = f(t); sum += v; n++; if (v > max) max = v; }
    return { avg: sum / n, max };
  };
  const metrics = [
    ['biz.order.in_tps', '주문 유입량', 'TPS', 'traffic', (t) => bizAt(t, ex)['biz.order.in_tps']],
    ['svc.cpu.pct', '서비스 CPU 사용률', '%', 'saturation', (t) => serviceAt(t, ex)['job.cpu.pct']],
    ['biz.order.latency_p99_ms', 'p99 응답 시간', 'ms', 'latency', (t) => bizAt(t, ex)['biz.order.latency_p99_ms']],
  ].map(([name, title, unit, signal, f]) => {
    const x = stat(A, f), y = stat(B, f);
    return { name, title, unit, signal, a: Math.round(x.avg), b: Math.round(y.avg), peak: Math.round(y.max) };
  });
  return { samplesA: pa.samples, samplesB: pb.samples, fns, top, path: best ? best.frames.split(';') : [top.leaf], path_pct: best && pb.samples ? r1((best.samples / pb.samples) * 100) : 0, metrics };
}
// 원인 추적 글에 쓰는 토막(추적 서랍 · 브리핑이 같은 말을 쓴다)
const ppOf = (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%p`;
const inflowText = (m) => `${m.title} ${fmtN(m.a)} → ${fmtN(m.b)} ${m.unit}(×${(m.b / m.a).toFixed(1)})`;
const xOf = (m) => `×${(m.b / m.a).toFixed(1)}`;

function mockTrace(c, a) {
  const { now } = c;
  const ai = c.flags.llm ? { state: 'ok', model: 'mock-llm', at: now - 4 * SEC } : { state: 'none' };
  const base = { alert_id: a.id, alert: a, final: true, at: now, functions: [], metrics: [], logs: [], log_count: 0, audit: [], evidence: [{ id: 'alert', kind: 'alert', label: '알림', title: a.message, alert_id: a.id, alert: a }], ai };
  if (a.kind === 'exit') {
    const d = { title: '종료 알림 — 원인은 종료 보고서(신호·콜스택·커널 로그)에서 분석', detail: '', confidence: 'low', evidence_ids: ['alert'], next_checks: ['종료 보고서에서 신호·콜스택·커널 로그 확인'], by: 'rule' };
    return { ...base, state: 'exit', note: d.title, rule: d, diag: d, ai: { state: 'none' } };
  }
  if (a.kind === 'service') { // 서비스 미기동: 함수 비교 대신 기동·종료 기록으로(매니저의 state down과 같은 모양)
    const title = String(a.message || '').split('(')[0] || a.name;
    const note = '서비스 미기동 알림 — 프로파일 비교 대상 없음, 기동·종료 이력(종료 보고서) 확인';
    const d = { title: `${title} · ${a.host}: 서비스 미기동 — 기동·종료 이력 확인`, detail: '', confidence: 'low', evidence_ids: ['alert'],
      next_checks: ['서비스 타임머신 사건 탭에서 마지막 종료 보고서·기동 실행 확인', '기동 배치(플로우) 실패·대기 여부 확인'], by: 'rule' };
    return { ...base, state: 'down', note, owner: `svc:${a.name}@${a.host}`, service: a.name, service_title: title, host: a.host, found: '서비스 알림',
      a: { from: 0, to: 0, samples: 0 }, b: { from: 0, to: 0, samples: 0 }, compared: false, rule: d, diag: d, ai: { state: 'none' } };
  }
  if (!TRACE_IDS.has(a.id) || !c.sig.surge) {
    const d = { title: `${a.host || a.group || '이 알림'}: 프로파일 대상 서비스 없음`, detail: '', confidence: 'low', evidence_ids: ['alert'], next_checks: [], by: 'rule' };
    return { ...base, state: 'no_owner', note: d.title, rule: d, diag: d, ai: { state: 'none' } };
  }
  const T = a.ts;
  // A 끝은 mock 폭주가 시작되는 때(full은 지금-4분, 체험판은 base-4분) 앞으로 자른다(타임머신의 A·B 비교가 추적과 같은 모양을 보이게)
  const A = { from: T - 5 * MIN, to: Math.min(T - 90 * SEC, surgeStart(c.sig)), samples: 861 }, B = { from: T - 30 * SEC, to: Math.min(now, T + 30 * SEC), samples: 2412 };
  let fns = [
    { leaf: 'book_insert', pct_a: 2.4, pct_b: 61.8, diff: 59.4 }, { leaf: 'check_risk', pct_a: 71.2, pct_b: 18.1, diff: -53.1 },
    { leaf: 'rebuild_book', pct_a: 0, pct_b: 9.5, diff: 9.5 }, { leaf: 'price_cross', pct_a: 14.3, pct_b: 6.2, diff: -8.1 }, { leaf: 'expire_orders', pct_a: 8.9, pct_b: 3.1, diff: -5.8 },
  ];
  let top = fns[0];
  let path = ['matching_svc', 'main', 'handle_order', 'book_insert'];
  let pathPct = 48.2;
  let metrics = [
    { name: 'biz.order.in_tps', title: '주문 유입량', unit: 'TPS', signal: 'traffic', a: 1500, b: 6000, peak: 6006 },
    { name: 'svc.cpu.pct', title: '서비스 CPU 사용률', unit: '%', signal: 'saturation', a: 21, b: 100, peak: 108 },
    { name: 'biz.order.latency_p99_ms', title: 'p99 응답 시간', unit: 'ms', signal: 'latency', a: 18, b: 142, peak: 210 },
  ];
  if (DEMO) { // 체험판: 고정 글자 대신 계산한 값(타임머신 비교표와 같은 숫자)
    const v = liteCompare(c, A, B);
    A.samples = v.samplesA;
    B.samples = v.samplesB;
    ({ fns, top, path, metrics } = v);
    pathPct = v.path_pct;
  }
  const self = `${top.pct_a}% → ${top.pct_b}%`, inflow = inflowText(metrics[0]);
  const ev = [...base.evidence,
    { id: 'owner', kind: 'owner', label: '체결 · match-01', title: '대상 프로세스: 체결 · match-01', lines: ['식별 경로: 업무 패널 \'체결\'의 서비스', '프로세스 키: svc:matching@match-01'], host: 'match-01', service: 'matching' },
    { id: 'window', kind: 'window', label: '구간', title: 'A(기준 구간) · B(이상 구간)', lines: [`A 프로파일 샘플 ${fmtN(A.samples)}개 · B 프로파일 샘플 ${fmtN(B.samples)}개`] },
    ...fns.map((f) => ({ id: 'fn:' + f.leaf, kind: 'fn', label: f.leaf, title: '함수 ' + f.leaf, lines: [`Self CPU 점유율 A ${f.pct_a}% → B ${f.pct_b}%`] })),
    { id: 'path', kind: 'path', label: '콜스택', title: '콜스택(B 구간 최빈 스택)', lines: [path.join(' › ')] },
    ...metrics.map((m) => ({ id: 'metric:' + m.name, kind: 'metric', label: m.title, title: m.title, lines: [`평균 A ${fmtN(m.a)} → B ${fmtN(m.b)} ${m.unit}`] })),
  ];
  const cpu = metrics.find((m) => m.name === 'svc.cpu.pct');
  const rule = { title: `원인 후보 ${top.leaf} — 주문 유입량 ${xOf(metrics[0])}`, detail: `Self CPU 점유율 ${self}(${ppOf(top.diff)}) · 동시간대 ${inflow}${cpu ? `, ${cpu.title} ${fmtN(cpu.a)} → ${fmtN(cpu.b)}${cpu.unit}(${xOf(cpu)})` : ''}`, confidence: 'high', evidence_ids: ['alert', 'owner', 'window', 'fn:book_insert', 'path', 'metric:biz.order.in_tps'], next_checks: ['B 구간 플레임 그래프에서 book_insert 호출 경로 확인', '주문 유입량 급증 출처 확인(정상 거래 / 재시도·비정상 호출)', 'book_insert의 입력 규모 비례 연산(반복·탐색)·락 경합 점검'], by: 'rule' };
  // 체험판 · 시연판의 AI 문장은 계산한 숫자만 옮긴다(숫자가 달라 full의 풀이 문장이 맞지 않을 수 있다)
  const llm = DEMO
    ? { title: `${top.leaf} CPU 점유율 급증 — 주문 유입 ${xOf(metrics[0])}`, detail: `Self CPU 점유율 ${self} · 동시간대 ${inflow}, 콜스택 ${path.slice(-2).join(' › ')}`, confidence: 'high', evidence_ids: ['fn:book_insert', 'path', 'metric:biz.order.in_tps'], next_checks: ['B 구간 플레임 그래프에서 book_insert 콜스택 확인', '주문 유입 급증 출처 확인(정상 거래 여부)'], by: 'llm', model: 'mock-llm', at: now - 4 * SEC }
    : { title: 'book_insert CPU 포화 — 주문 유입 ×4.0', detail: '점유율 이동이 유입 배수보다 큼 — 건당 삽입 비용 증가, 원인은 근거에 없음', confidence: 'medium', evidence_ids: ['fn:book_insert', 'metric:biz.order.in_tps', 'metric:svc.cpu.pct'], next_checks: ['book_insert 호가 단계 수·삽입 위치 분포 확인', 'rebuild_book B 구간 호출 조건·빈도 확인', '유입 급증 종목·주문 유형 편중 확인'], by: 'llm', model: 'mock-llm', at: now - 4 * SEC };
  return { ...base, state: 'ok', owner: 'svc:matching@match-01', service: 'matching', service_title: '체결', host: 'match-01', found: '업무 패널 \'체결\'의 서비스',
    a: A, b: B, compared: true, functions: fns, top, path, path_pct: pathPct, metrics, evidence: ev, rule, llm: c.flags.llm ? llm : undefined, diag: c.flags.llm ? llm : rule };
}

function trace(c, m) {
  // 화면 목록과 같은 /alerts(mock/services.js가 서비스 미기동 알림을 끼워 넣은 뒤)에서 찾는다
  const list = routes.find(([mt, re]) => mt === 'GET' && re.test('/alerts'))[2]({ ...c, q: new URLSearchParams('state=all&limit=100000') });
  const a = ((list.body && list.body.alerts) || []).find((x) => x.id === Number(m[1]));
  return a ? ok(mockTrace(c, a)) : err(404, '없는 알림');
}

// 현상 한 줄(매니저 brief/focus.go symptomOf와 같은 모양): 지표 · 현재 값 · 기준. mock 문구 꼴(서버 · 로그)도 가른다.
const TILE_MSG = /^(.+?) (값 끊김 \S+|-?[0-9][0-9,.]*\S*)(?: · (\S+))? \(([^)]*)\)$/;
const limitText = (s) => {
  const m = /^(위험|경고) (하한 )?(.*)$/.exec(String(s).trim());
  return m ? (m[2] ? `하한 ${m[3]}` : `임계 ${m[3]}`) : String(s).trim();
};
function symptomOf(a, ref) {
  const s = { label: '', value: '', limit: '', host: a.host || '', level: a.level, refs: [ref] };
  const short = String(a.message || '').split(' · ').slice(1).join(' · ') || a.message;
  const m = TILE_MSG.exec(short);
  if (a.kind === 'tile' && m) return { ...s, label: m[1], value: m[2], limit: limitText(m[4]), host: m[3] || s.host };
  if (a.kind === 'log') { const n = /\(E\) 로그 ([\d,]+)건/.exec(a.message); return { ...s, label: `오류 로그(${String(short).split(' ')[0]})`, value: `${n ? n[1] : fmtN(a.value)}건` }; }
  if (a.kind === 'host' && m) return { ...s, label: m[1], value: m[2], limit: limitText(m[4]) }; // "CPU 78% (경고 70%)"
  return { ...s, label: a.host || a.group || '', value: short };
}
const LV = { crit: 2, warn: 1, ok: 0 };
const KIND_RANK = { tile: 0, service: 1, log: 2, host: 3 };
const byLevel = (x, y) => (LV[y.level] || 0) - (LV[x.level] || 0);

function brief(c) {
  const { now } = c;
  const firing = buildAlerts(c).filter((a) => a.state === 'firing');
  const ev = [], lines = [], others = [];
  const seen = new Set();
  const alertEv = (a) => {
    const id = `alert:${a.id}`;
    if (!seen.has(id)) { seen.add(id); ev.push({ id, kind: 'alert', label: a.kind === 'host' ? a.host : (a.message.split(' · ')[1] || a.message).replace(/\s[\d,.]+.*$/, ''), title: a.message, alert_id: a.id, alert: a, host: a.host }); }
    return id;
  };
  const shortOf = (a) => a.message.replace(' · ', ' ');
  const biz = firing.filter((a) => a.group === '매매체결' && !['host', 'exit', 'run'].includes(a.kind));
  const vendor = firing.filter((a) => a.group === '정보분배' && a.kind === 'tile');
  const hosts = firing.filter((a) => a.kind === 'host');
  const runs = firing.filter((a) => a.kind === 'run');
  let tb = null, focus = null;
  if (biz.length) {
    const ids = biz.map(alertEv);
    lines.push({ text: `체결: ${biz.slice(0, 2).map((a) => a.message.split(' · ').slice(1).join(' · ')).join(', ')}${biz.length > 2 ? ` 외 ${biz.length - 2}건` : ''}`, level: 'crit', refs: ids });
    const t = mockTrace(c, biz.find((a) => a.kind === 'tile') || biz[0]);
    tb = { alert_id: t.alert_id, message: t.alert.message, level: t.alert.level, state: t.state, final: true, service: t.service, service_title: t.service_title, host: t.host, a: t.a, b: t.b, compared: t.compared, top: t.top, path: t.path,
      metric: inflowText(t.metrics[0]), trigger: inflowText(t.metrics[0]), diag: t.diag, ai: t.ai };
    ev.push({ id: 'trace', kind: 'trace', label: '원인 분석', title: '원인 분석: ' + t.alert.message, lines: [t.diag.title], alert_id: t.alert_id, host: t.host, service: t.service });
    lines.push({ text: t.rule.title, level: 'crit', refs: ['trace'] });
    // 대표 이슈: 체결 알림 + 원인 분석이 따라간 서버(match-01)의 서버 알림
    const related = hosts.filter((a) => a.host === t.host || biz.some((b) => b.host && b.host === a.host));
    const all = [...biz, ...related].sort((x, y) => byLevel(x, y) || (KIND_RANK[x.kind] ?? 9) - (KIND_RANK[y.kind] ?? 9));
    focus = { title: '체결 응답 지연', level: all.some((a) => a.level === 'crit') ? 'crit' : 'warn', since: Math.min(...all.map((a) => a.ts)),
      hosts: [...new Set([t.host, ...biz.map((a) => a.host).filter(Boolean)])].sort(), symptoms: all.slice(0, 5).map((a) => symptomOf(a, alertEv(a))), traced: true };
  }
  if (vendor.length) { // 시연판: 벤더 패널 알림 묶음(매니저는 패널 묶음마다 한 줄)
    const ids = vendor.map(alertEv);
    lines.push({ text: `정보 벤더 시세: ${vendor[0].message.split(' · ').slice(1).join(' · ')}${vendor.length > 1 ? ` 외 ${vendor.length - 1}건` : ''}`, level: 'crit', refs: ids });
    const sy = symptomOf(vendor[0], ''); // 칩: 묶음 이름 + 지표 · 값 · 서버(매니저 chipText)
    others.push({ text: `정보 벤더 시세 유입 이상 · ${sy.label} ${sy.value}${sy.host ? ` · ${sy.host}` : ''}${vendor.length > 1 ? ` 외 ${vendor.length - 1}건` : ''}`, level: 'crit', refs: ids });
  }
  if (hosts.length) {
    const ids = hosts.map(alertEv);
    lines.push({ text: `서버 이상 ${hosts.length}대: ${hosts.slice(0, 3).map(shortOf).join(', ')}`, level: 'crit', refs: ids });
    // 기타 이슈 칩: "dw-02 메모리 93% (임계 90%)"(현상 줄과 같은 말: 수준은 아이콘이 보인다)
    const chipOf = (a) => { const sy = symptomOf(a, ''); return sy.limit ? `${a.host} ${sy.label} ${sy.value} (${sy.limit})` : shortOf(a); };
    for (const a of hosts) if (!focus || !focus.symptoms.some((s) => s.refs[0] === `alert:${a.id}`)) others.push({ text: chipOf(a), level: a.level, refs: [alertEv(a)] });
  }
  // 장애 위험도 · 진행 중 장애(매니저: 대표 이슈의 장애 기록은 기타 이슈에 따로 쓰지 않는다)
  const rv = riskView(c);
  ev.push({ id: 'risk', kind: 'risk', label: '위험도', title: `장애 위험 지수 ${Math.round(rv.open_index)}` });
  if (rv.open_level !== 'ok') others.push({ text: `장애 위험 지수 ${Math.round(rv.open_index)}`, level: rv.open_level, refs: ['risk'] });
  for (const inc of rv.incidents || []) {
    const id = `incident:${inc.id}`;
    ev.push({ id, kind: 'incident', label: '장애', title: '진행 중 장애: ' + inc.title });
    if (focus && !focus.incident && String(inc.title).replace(/^자동: /, '').startsWith('체결 · ')) { focus.incident = { ref: id, title: inc.title, start: inc.start }; continue; }
    others.push({ text: `진행 중 장애: ${inc.title} (${Math.round((now - inc.start) / MIN)}분 경과)`, level: 'crit', refs: [id] });
  }
  if (runs.length) {
    const names = [...new Set(runs.map((a) => a.name))].slice(0, 2);
    others.push({ text: `배치 실행 실패 ${runs.length}건: ${names.join(', ')}`, level: 'crit', refs: runs.map(alertEv) });
  }
  others.sort(byLevel);
  const level = firing.some((a) => a.level === 'crit') ? 'crit' : firing.length ? 'warn' : 'ok';
  const hostsOnly = !focus && hosts.length && !runs.length && !vendor.length;
  const title = focus ? focus.title : hostsOnly ? `서버 이상 ${hosts.length}대` : others.length ? `진행 중 이슈 ${others.length}건` : '전체 정상';
  const rule = { at: now, written_at: now, level, by: 'rule', evidence: ev, trace: tb, lines: lines.slice(0, 4), title, focus, others: others.slice(0, 8),
    headline: biz.length ? '체결 응답 지연(위험) — 원인 후보 book_insert' : hosts.length ? `위험 ${hosts.length}건 — ${hosts[0].message}` : '전체 정상 — 진행 중 알림 없음',
    next_checks: biz.length ? ['B 구간 플레임 그래프에서 book_insert 호출 경로 확인', '주문 유입량 급증 출처 확인(정상 거래 / 재시도·비정상 호출)'] : [],
    ai: { state: 'none' } };
  ev.push({ id: 'scope', kind: 'scope', label: '범위', title: `범위 전체 · 서버 ${c.w.hosts.length}대 · 진행 중 알림 ${firing.length}건` });
  if (!c.flags.llm) return ok(rule);
  // AI 초안: 제목과 판단(칸들을 이어 읽는 인과 · 별건 구분)만. 칸의 수치는 옮겨 적지 않는다
  const apart = others.filter((o) => o.refs.some((r) => r.startsWith('alert:') && hosts.some((a) => `alert:${a.id}` === r))).slice(0, 2);
  const apartNames = apart.map((o) => o.text.split(' ')[0]);
  return ok({ ...rule, by: 'llm', model: 'mock-llm', written_at: now - 4 * SEC, ai: { state: 'ok', model: 'mock-llm', at: now - 4 * SEC }, rule: { ...rule, rule: undefined },
    headline: biz.length ? '체결 응답 지연 — 주문 유입 급증' : rule.title,
    lines: biz.length ? [
      { text: `주문 유입 급증이 ${tb.top.leaf} CPU 점유를 끌어올려 체결 대기 큐·응답 시간이 임계 초과`, level: 'crit', refs: ['trace', ...focus.symptoms.slice(0, 1).flatMap((s) => s.refs)] },
      ...(apart.length ? [{ text: `${apartNames.join('·')} 서버 이상은 체결과 별건 — 체결 처리 복구 우선`, level: 'warn', refs: apart.flatMap((o) => o.refs).slice(0, 3) }] : []),
    ] : rule.lines,
    next_checks: biz.length ? ['book_insert 호가 단계 수·삽입 위치 분포 확인', '유입 급증 종목·주문 유형 편중 확인'] : [] });
}

export const routes = [
  ['GET', /^\/brief$/, brief],
  ['GET', /^\/alerts\/(\d+)\/trace$/, trace],
  ['GET', /^\/alerts$/, alerts],
  ['POST', /^\/alerts\/(\d+)\/ack$/, ack],
  ['GET', /^\/risk$/, risk],
  ['POST', /^\/risk\/train$/, train],
  ['GET', /^\/risk\/holds$/, listHolds],
  ['POST', /^\/risk\/holds$/, addHold],
  ['DELETE', /^\/risk\/holds\/(\d+)$/, releaseHold],
  ['GET', /^\/incidents$/, incidents],
  ['POST', /^\/incidents$/, addIncident],
  ['POST', /^\/incidents\/import$/, importIncidents],
  ['PATCH', /^\/incidents\/(\d+)$/, patchIncident],
  ['GET', /^\/export\/risk-dataset$/, riskDataset],
];
