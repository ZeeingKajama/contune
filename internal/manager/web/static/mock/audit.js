// 감사 기록 mock. GET /audit · GET /flows/{id}/history (계약: docs/cards/S-audit.md)
// 체험판(profile.js의 lite): 씨앗은 작은 세계에 맞는 열 몇 건(시각은 세계를 만든 때 base 기준, 있는 플로우 · 서버 · 실행만)이고,
// 이 세션에서 한 조작(c.w.audit: 재실행 · 강제 종료 · 강제 OK · 지금 실행 · 알림 확인 · 보드 · 플로우 · 로그 수집 저장 …)을 그 위에 보탠다.
// 플로우 '변경 이력' 탭도 같은 목록에서 그 플로우의 저장 · 삭제만 골라 준다(방금 한 저장이 탭에도 보인다).
// 시연판(summit): 같은 방식에 씨앗 종류를 더한다(summitSeed). 조작의 '누가'는 조작한 때 로그인해 있던 사용자다(index.js가 적어 둔 by).
import { MIN, DAY, hash32, rnd, sha, fmtN, fmtKst } from './util.js';
import { DEMO, SUMMIT } from './profile.js';
import { holdsOf, FEATURE_TITLE } from './riskhold.js';
import { trainDetail, seedModel } from './alert.js';
import { userId } from './auth.js';
import { seedHistory as collectSeed } from './collect.js';
import { defSha } from './editor.js';
import { seedBoards } from './dash.js';

const ok = (body, status = 200) => ({ status, body });
const err = (status, msg) => ({ status, body: { error: msg } });

const KINDS = { login: ['login.', 'logout'], flow: ['flow.'], run: ['run.'], alert: ['alert.'], risk: ['risk.', 'incident.'], audit: ['audit.'], collect: ['collect.'], panels: ['panels.'], dash: ['dash.'] };
const inKind = (action, kind) => (KINDS[kind] || []).some((p) => action.startsWith(p));

const U = 'user:admin', O = 'user:operator';
// [몇 분 전, actor, action, target, detail] — 지난 24시간에 걸친 마흔 몇 건
const SPEC = [
  [1380, U, 'login.ok', 'admin', 'role=admin from=10.0.1.20'],
  [1366, U, 'flow.save', 'market-open', 'flows/개장준비/market-open.yaml 3f9a1c2e → 7b20d4aa'],
  [1290, O, 'login.ok', 'operator', 'role=operator from=10.0.1.31'],
  [1241, O, 'run.manual', 'daily-settle', '실행 1건'],
  [1203, O, 'run.rerun', '01JC8M2Q4T9XK0A7V5N3B6D1ER', 'daily-settle/settle → 01JC8M7W0P2ZH8R4C9E5F1G6TY'],
  [1105, 'user:web(10.0.2.8)', 'alert.ack', 'al-cpu-batch-01', 'CPU 사용률 높음 · batch-01'],
  [1012, U, 'risk.train', 'risk', '표본 412건 · 정확도 0.87'],
  [955, U, 'incident.create', 'incident:7', '체결 지연 20분'],
  [900, U, 'incident.update', 'incident:7', '체결 지연 20분 (원인 기재)'],
  [842, O, 'logout', 'operator', ''],
  [790, 'web(10.0.1.2)', 'login.fail', 'adm1n', ''],
  [733, U, 'flow.save', 'ext-send-margin', 'flows/대외송수신/ext-send-margin.yaml 90c1be07 → a4d83e15'],
  [688, U, 'incident.import', 'incidents', '12건'],
  [640, O, 'run.kill', '01JC8P0K6V3NX1B8T2M7Q4Z9HD', 'ext-send-margin/send-margin'],
  [602, O, 'run.force_ok', '01JC8P0K6V3NX1B8T2M7Q4Z9HD', 'ext-send-margin/send-margin 사유: 상대 기관에서 수동 수신 확인함'],
  [560, 'user:web(10.0.2.8)', 'run.manual', 'market-open', '실행 1건'],
  [521, U, 'flow.delete', 'tmp-test-flow', ''],
  [470, U, 'audit.export', 'audit', '어제 00:00 ~ 오늘 00:00 · 312건'],
  [405, U, 'flow.save', 'daily-settle', 'flows/정산/daily-settle.yaml 5e07c9d1 → 0b8f62c3'],
  [352, O, 'alert.ack', 'al-lag-match-01', '체결 지연 · match-01'],
  [301, O, 'run.rerun', '01JC9A4D8R1MB6Y0S3W2K7N5JF', 'market-open/load-equity → 01JC9A9T3H5QX2C8V1Z4E6P0LM'],
  [240, U, 'risk.train', 'risk', '표본 436건 · 정확도 0.89'],
  [214, U, 'collect.discover', 'host:match-01', '후보 6개'],
  [212, U, 'collect.peek', 'host:match-01', '/data/log/matching_svc.01JC9B2K.log 20줄'],
  [209, U, 'collect.save', 'group:매매체결', 'group-매매체결.yaml 4c1e9a07 → 8b52d3f6 로그 파일 1개'],
  [190, U, 'flow.save', 'market-open', 'flows/개장준비/market-open.yaml 7b20d4aa → c91e5f08'],
  // 몰림: 3분 사이 5회
  [98, 'web(10.0.3.7)', 'login.fail', 'admin', ''],
  [97, 'web(10.0.3.7)', 'login.fail', 'admin', ''],
  [96.5, 'web(10.0.3.7)', 'login.fail', 'administrator', ''],
  [96, 'web(10.0.3.7)', 'login.fail', 'root', ''],
  [95, 'web(10.0.3.7)', 'login.fail', '=cmd|calc!A1', ''],
  [88, 'web(10.0.1.2)', 'login.fail', 'admin', ''],
  [84, U, 'login.ok', 'admin', 'role=admin from=10.0.1.20'],
  [70, U, 'alert.ack', 'al-disk-ext-03', '디스크 사용률 높음 · ext-03'],
  [64, O, 'risk.ack', 'risk:mem_max', '최대 메모리 사용률 93 · 한도 111.6 · ~16:12'],
  [63, O, 'risk.accept', 'risk:mem_max', '최대 메모리 사용률 93 · 한도 111.6 · ~19:42 · 사유: 정산 배치 캐시 적재'],
  [41, 'system', 'risk.expire', 'risk:queue', '대기 큐 #99 한도 초과 2,410'],
  [61, O, 'login.ok', 'operator', 'role=operator from=10.0.1.31'],
  [47, O, 'run.manual', 'ext-send-margin', '실행 1건'],
  [33, O, 'run.kill', '01JCA2F7E4W9ZT5N0D3R8H1BKC', 'daily-settle/settle-report'],
  [26, O, 'run.force_ok', '01JCA2F7E4W9ZT5N0D3R8H1BKC', 'daily-settle/settle-report 사유: 보고서는 수작업으로 발송 완료'],
  [30, U, 'panels.reload', 'panels', '패널 2개, 읽지 못한 파일 1개'],
  [22, U, 'collect.delete', 'host:rds-03', 'host-rds-03.yaml'],
  [18, U, 'incident.create', 'incident:8', '정산 보고서 지연'],
  [12, U, 'flow.save', 'ext-send-margin', 'flows/대외송수신/ext-send-margin.yaml a4d83e15 → 1d6c70b9'],
  [6, U, 'audit.export', 'audit', '최근 24시간 · 41건'],
  [2, O, 'logout', 'operator', ''],
];

function build(now) {
  // id는 오래된 것부터 1, 2, …(서버와 같음). 응답은 계약대로 최신 먼저(id 내림차순).
  return SPEC.slice().sort((a, b) => b[0] - a[0]).map((s, i) => ({
    id: i + 1, ts: Math.round(now - s[0] * MIN), actor: s[1], action: s[2], target: s[3], detail: s[4],
  })).reverse();
}

// ---- 체험판 ----
const DAY_MIN = 24 * 60;
const WEB = 'user:web(127.0.0.1)'; // mock 조작이 쓰는 actor(ops.js 등). 화면에는 로그인한 사용자로 보인다
const h8 = (k) => hash32(k).toString(16).padStart(8, '0');

// 씨앗(id 없이, 순서 없이). 줄거리: 어제 관리자가 플로우 둘을 손봄 → 밤사이 로그인 실패 몰림 → 개장 전 운영자가 fetch-ref 검증 스텝을
// 강제 종료하고 강제 OK → 체결 서비스가 죽은 뒤 관리자가 매매체결 로그 수집을 고침 → 운영자가 업무 흐름 보드를 저장.
function liteSeed(c) {
  const w = c.w, base = w.base;
  const out = [];
  const add = (ago, actor, action, target, detail) => out.push({ ts: Math.round(base - ago * MIN), actor, action, target, detail });
  add(1310, U, 'login.ok', 'admin', 'role=admin from=10.0.1.20');
  // 플로우 저장: 플로우마다 2~3건. 내용의 sha는 이어지고 맨 끝은 지금 정의의 sha(이 세션에서 먼저 고쳤으면 그 저장이 떠난 sha).
  // 최근 24시간 안에는 둘(daily-settle · ext-send-margin), 나머지는 그보다 전이라 구간을 넓혀야 보인다
  const recent = { 'daily-settle': 1296, 'ext-send-margin': 1288 };
  for (const f of w.flows) {
    const first = (w.audit || []).find((e) => e.action.startsWith('flow.') && e.target === f.id);
    const m = first ? / (\S+) → \S+$/.exec(first.detail || '') : null;
    if (m && m[1] === '-') continue; // 이 세션에서 새로 만든 플로우
    const file = f.file || `flows/${f.board}/${f.id}.yaml`;
    const n = 2 + (hash32(f.id) % 2);
    let ago = recent[f.id] || DAY_MIN + 120 + Math.round(rnd(f.id + 't') * 1500);
    for (let k = 0; k < n; k++) {
      const to = k === 0 ? (m ? m[1] : defSha(f).slice(0, 8)) : h8(f.id + k);
      add(ago, U, 'flow.save', f.id, `${file} ${k === n - 1 ? '-' : h8(f.id + (k + 1))} → ${to}`);
      ago = Math.max(ago, DAY_MIN) + 240 + Math.round(rnd(f.id + 't' + k) * 2400);
    }
  }
  // 로그인 실패 몰림: 같은 곳에서 2분 사이 4회
  for (const [ago, id] of [[742, 'admin'], [741.5, 'admin'], [741, 'administrator'], [740, 'root']]) add(ago, 'web(10.0.3.7)', 'login.fail', id, '');
  // 강제 종료 · 강제 OK 한 쌍: 개장 전 fetch-ref › verify-ref의 최근 실행(세계에 있는 실행 ID라 대상 링크가 열린다).
  // 그 실행에 강제 종료 · 강제 OK 이벤트가 있으면 그 시각 · 사유를 그대로 쓰고, 없으면 끝난 때와 4분 뒤로 둔다
  const vr = w.runs.filter((r) => r.flow_id === 'fetch-ref' && r.step_id === 'verify-ref' && r.ended_at).sort((a, b) => b.started_at - a.started_at)[0];
  if (vr) {
    const evs = vr.events || [];
    const kill = evs.find((e) => e.to === 'KILLED'), fok = evs.find((e) => /^force-ok/.test(e.reason || ''));
    const killed = kill ? kill.ts : vr.ended_at;
    const why = (fok && fok.reason.replace(/^force-ok:?\s*/, '')) || '기준 정보는 원본과 수작업으로 대조함';
    out.push({ ts: vr.started_at - 4 * MIN, actor: O, action: 'login.ok', target: 'operator', detail: 'role=operator from=10.0.1.31' });
    out.push({ ts: killed, actor: O, action: 'run.kill', target: vr.exec_id, detail: 'fetch-ref/verify-ref' });
    out.push({ ts: fok ? fok.ts : killed + 4 * MIN, actor: O, action: 'run.force_ok', target: vr.exec_id, detail: `fetch-ref/verify-ref 사유: ${why}` });
  }
  add(SUMMIT ? 201 : 121, U, 'login.ok', 'admin', 'role=admin from=10.0.1.20');
  // 로그 수집 변경: 로그 수집 화면의 변경 이력과 같은 줄
  for (const e of collectSeed(base)) out.push({ ts: e.ts, actor: e.actor, action: e.action, target: e.target, detail: e.detail });
  // 보드 저장: 예시 보드의 '마지막 저장'과 같은 사람 · 때 · rev
  for (const b of seedBoards(c)) out.push({ ts: b.updated_at, actor: b.updated_by, action: 'dash.save', target: b.id, detail: `바꿈 · 위젯 ${b.widgets}개 · rev ${sha(b.id + '/prev')}→${b.rev}` });
  if (SUMMIT) summitSeed(c, out, add);
  return out.filter((e) => e.ts < base);
}

// ---- 시연판 씨앗 ----
// 체험판 씨앗에 없는 종류를 더한다. 가리키는 것은 세계에 있는 것뿐이고(지운 플로우만 예외), 글은 매니저가 남기는 꼴이다.
//   위험 요인 확인 중 · 이상 없음 · 해제 · 자동 해제: 위험도 화면 이력(riskhold.js 씨앗)과 같은 줄
//   자동 장애 기록 확인 · 장애 기록 수정: 세계의 장애 기록
//   위험 지수 학습 · 로그 파일 찾기 · 미리보기 · 업무 패널 다시 읽기: 시세 로그에서 숫자를 뽑아 벤더 패널을 붙인 날의 흐름
//   수동 실행: svr_b가 죽은 뒤 운영자가 BATCH_JOB을 다시 돌린 것(w.batchRuns[1])
//   플로우 저장 · 삭제: 어제 관리자가 만들었다 지운 임시 플로우 · 감사 기록 내려받기 · 로그인 실패 몰림 다섯째(같은 곳 5분 새 5회)
const hhmm = (ts) => fmtKst(ts).slice(0, 5);
const p2 = (n) => String(n).padStart(2, '0');
const ymdhm = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
function summitSeed(c, out, add) {
  const w = c.w, base = w.base;
  const mine = w.audit || [];
  for (const h of holdsOf(w)) {
    if (h.id >= 100) continue; // 이 세션에서 건 표시는 c.w.audit에 있다
    const t = FEATURE_TITLE[h.feature];
    out.push({ ts: h.at, actor: h.by, action: `risk.${h.kind}`, target: `risk:${h.feature}`, detail: `${t} ${fmtN(h.value)} · 한도 ${fmtN(h.limit)} · ~${hhmm(h.until)}${h.reason ? ` · 사유: ${h.reason}` : ''}` });
    if (!h.ended_at) continue;
    out.push(h.ended_by === 'system'
      ? { ts: h.ended_at, actor: 'system', action: 'risk.expire', target: `risk:${h.feature}`, detail: `${t} #${h.id} ${h.end_note}` }
      : { ts: h.ended_at, actor: h.ended_by, action: 'risk.release', target: `risk:${h.feature}`, detail: `${t} #${h.id}` });
  }
  for (const i of w.incidents) {
    if (i.source !== 'auto' || !i.confirmed || !i.end || mine.some((e) => e.action === 'incident.confirm' && e.target === `incident:${i.id}`)) continue;
    out.push({ ts: i.end + 14 * MIN, actor: O, action: 'incident.confirm', target: `incident:${i.id}`, detail: `${i.title} · 장애로 확인` });
  }
  const ext = w.incidents.find((i) => i.source === 'seed' && i.title === '대외 전송 실패');
  if (ext) out.push({ ts: ext.end + 6 * MIN, actor: O, action: 'incident.update', target: `incident:${ext.id}`, detail: ext.title });
  add(196, U, 'collect.discover', 'host:feed-01', '후보 7개');
  add(194, U, 'collect.peek', 'host:feed-01', '/var/lib/eum/logs/quote_feed.log 48줄');
  add(185, U, 'panels.reload', 'panels', '패널 7개, 읽지 못한 파일 1개');
  add(170, U, 'risk.train', 'risk', trainDetail('model', seedModel(w)));
  const bj = w.batchRuns && w.batchRuns[1];
  if (bj) out.push({ ts: bj.scheduled_at, actor: O, action: 'run.manual', target: bj.flow_id, detail: `flow_run_id=${bj.flow_run_id} 스텝 1개` });
  const tmp = 'flows/정산/tmp-settle-check.yaml';
  add(1304, U, 'flow.save', 'tmp-settle-check', `${tmp} - → ${h8('tmp-settle-check')}`);
  add(1299, U, 'flow.delete', 'tmp-settle-check', `${tmp} ${h8('tmp-settle-check')} → -`);
  add(739.5, 'web(10.0.3.7)', 'login.fail', '=cmd|calc!A1', '');
  // 감사 기록 내려받기: 그때까지의 24시간, 건수는 이 씨앗에서 센다
  const at = Math.round(base - 1270 * MIN);
  out.push({ ts: at, actor: U, action: 'audit.export', target: 'audit', detail: `${ymdhm(at - DAY)} ~ ${ymdhm(at)} ${out.filter((e) => e.ts >= at - DAY && e.ts < at).length}건` });
}
const seeds = new WeakMap(); // 세계마다 한 번(id는 오래된 것부터 1, 2, …)
function liteList(c) {
  let seed = seeds.get(c.w);
  if (!seed) {
    seed = liteSeed(c).sort((a, b) => a.ts - b.ts).map((e, i) => ({ id: i + 1, ...e }));
    seeds.set(c.w, seed);
  }
  // 이 세션의 조작: 쌓인 순서대로 씨앗 뒤 id. '누가'는 로그인한 사용자, 대상 · 내용은 매니저가 남기는 꼴로 맞춘다
  const mine = (c.w.audit || []).map((e, i) => {
    let target = String(e.target ?? ''), detail = String(e.detail ?? '');
    if (e.action.startsWith('incident.') && /^\d+$/.test(target)) target = 'incident:' + target;
    if (e.action === 'incident.import') { target = target || 'incidents'; if (/^\d+$/.test(detail)) detail += '건'; }
    return { id: seed.length + i + 1, ts: e.ts, actor: e.actor === WEB ? `user:${e.by || userId()}` : e.actor, action: e.action, target, detail }; // by: 시연판이 조작 때 적어 둔 사용자(index.js)
  });
  return [...seed, ...mine].reverse(); // 최신 먼저(id 내림차순)
}

const num = (v) => (v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function audit(c) {
  const q = c.q;
  const to = q.get('to') !== null ? num(q.get('to')) : c.now;
  const from = q.get('from') !== null ? num(q.get('from')) : (to == null ? null : to - 24 * 60 * MIN);
  if (from == null || to == null || from >= to) return err(400, 'bad from/to');
  const kind = q.get('kind') || '';
  if (kind && !KINDS[kind]) return err(400, 'unknown kind');
  const actor = q.get('actor') || '', text = (q.get('q') || '').toLowerCase();
  const before = num(q.get('before'));
  const limit = Math.min(1000, num(q.get('limit')) || 200);
  const inRange = (DEMO ? liteList(c) : build(c.now)).filter((e) => e.ts >= from && e.ts <= to);
  const stats = { actions: {}, actors: {} };
  for (const e of inRange) {
    stats.actions[e.action] = (stats.actions[e.action] || 0) + 1;
    stats.actors[e.actor] = (stats.actors[e.actor] || 0) + 1;
  }
  const hit = inRange.filter((e) => (!kind || inKind(e.action, kind)) && (!actor || e.actor === actor)
    && (!text || [e.actor, e.action, e.target, e.detail].some((v) => v.toLowerCase().includes(text)))
    && (before == null || e.id < before));
  if (q.get('format') === 'csv') {
    const rows = hit.map((e) => [e.id, new Date(e.ts).toISOString(), e.actor, e.action, e.target, e.detail].join(','));
    return { status: 200, contentType: 'text/csv', body: ['id,time,actor,action,target,detail', ...rows].join('\n') };
  }
  return ok({ entries: hit.slice(0, limit), more: hit.length > limit, stats, from, to });
}

// 플로우마다 2~3건의 저장 기록(조금씩 다른 시각·사용자)
function history(c, m) {
  const id = decodeURIComponent(m[1]);
  const f = c.w.flows.find((x) => x.id === id);
  if (!f) return err(404, 'flow not found');
  const limit = Math.min(1000, num(c.q.get('limit')) || 50);
  // 체험판: 감사 기록과 같은 목록에서(씨앗 + 이 세션의 저장)
  if (DEMO) return ok({ entries: liteList(c).filter((e) => e.action.startsWith('flow.') && e.target === id).slice(0, limit) });
  const n = 2 + (hash32(id) % 2);
  const sha = (k) => hash32(id + k).toString(16).padStart(8, '0').slice(0, 8);
  const out = [];
  for (let k = 0; k < n; k++) {
    const ago = Math.round((k + 1) * (180 + rnd(id + 't' + k) * 900));
    out.push({
      id: 900 - k, ts: Math.round(c.now - ago * MIN), actor: k === 1 ? O : U, action: 'flow.save', target: id,
      detail: `${f.file || `flows/${f.board}/${id}.yaml`} ${sha(k + 1)} → ${sha(k)}`,
    });
  }
  return ok({ entries: out.slice(0, limit) });
}

export const routes = [
  ['GET', /^\/audit$/, audit],
  ['GET', /^\/flows\/([^/]+)\/history$/, history],
];
