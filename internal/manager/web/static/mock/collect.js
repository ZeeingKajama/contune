// 수집 설정 mock (계약: docs/cards/L-collect.md "화면 API").
// GET/PUT/DELETE /collect · /collect/hosts/{host} · POST /collect/{reload,discover,peek} · GET /collect/history
// 권한은 mock/auth.js의 기본 규칙(조회는 GET, 나머지는 관리)을 그대로 쓴다.
// 체험판(profile.js의 lite): 적용 대상 넷(all · group:매매체결 · host:match-01 · group:정보분배), 읽지 못한 파일 없음, 서버는 모두 '적용됨'.
// 저장 · 삭제는 감사 기록(c.w.audit)에도 남고, 변경 이력 씨앗의 시각은 세계를 만든 때(base) 기준이다(감사 기록 씨앗과 같은 줄).
import { MIN, hash32 } from './util.js';
import { DEMO, SUMMIT, pick, pickDemo } from './profile.js';
import { userId } from './auth.js';

const ok = (body, status = 200) => ({ status, body });
const err = (status, msg, extra) => ({ status, body: { error: msg, ...(extra || {}) } });

const hex = (s, n = 8) => {
  let out = '';
  for (let i = 0; out.length < n; i++) out += hash32(s + '#' + i).toString(16).padStart(8, '0');
  return out.slice(0, n);
};
const QUOTE_METRICS = [
  { name: 'biz.vendor.tps', re: 'recv=([\\d,]+)', agg: 'sum' },
  { name: 'biz.vendor.count_1m', re: 'recv=([\\d,]+)', agg: 'sum', window: '60s' },
];
const LOGW = [{ re: '^\\(E\\)', level: 'error' }, { re: '^\\(W\\)', level: 'warn' }];

let S = null;
// 처음의 설정 파일들(프로필마다 고정)
function seedSets() {
  const mk = (scope, file, logs) => ({ scope, file, logs, sha: hex(JSON.stringify(logs) + scope, 64) });
  const all5 = [
    mk('all', 'all.yaml', [{ name: 'step', path: '{log_dir}/step.{exec_id}.log', match: [{ re: '^ERROR', level: 'error' }, { re: '^WARN', level: 'warn' }] }]),
    mk('group:매매체결', 'group-매매체결.yaml', [{ name: 'matching', path: '{log_dir}/matching_svc.{exec_id}.log', match: LOGW }]),
    mk('host:match-01', 'host-match-01.yaml', [
      { name: 'matching', path: '{log_dir}/matching_svc.{exec_id}.log', match: [...LOGW, { re: '^\\(F\\)', level: 'error' }] },
      { name: 'order-gw', path: '/var/lib/eum/logs/gw/order_*.log', match: [{ re: 'REJECT', level: 'warn' }] },
    ]),
    // 에이전트 허용 폴더(read_roots) 밖이라 dw-03이 이 파일만 건너뛴다(일부 적용)
    // 시세 로그: 줄 규칙 없이 통계 줄(recv=N)에서 숫자만 뽑는다(05 §18)
    mk('group:정보분배', 'group-정보분배.yaml', [{ name: 'quote', path: '{log_dir}/quote_feed.log', match: [], metrics: QUOTE_METRICS }]),
    mk('host:dw-03', 'host-dw-03.yaml', [{ name: 'etl-load', path: '/data/etl/load_*.log', match: [{ re: 'ORA-\\d+', level: 'error' }] }]),
  ];
  // 체험판: 세계에 없는 서버(dw-03)의 설정과 읽지 못한 파일은 없다
  return pick(all5, all5.filter((x) => x.scope !== 'host:dw-03'));
}
function state(now) {
  if (S) return S;
  S = {
    sets: seedSets(),
    errors: pick([{ file: 'group-청산결제.yaml', msg: "로그 파일 'settle'(1번째) 규칙 2 정규식: 정규식(RE2)을 해석하지 못함: error parsing regexp: missing closing ): `^(E`" }], []),
    pendingUntil: {}, seen: {},
    audit: seedHistory(now),
    auditSeq: SUMMIT ? 4 : 3,
  };
  return S;
}
// 변경 이력 씨앗(최신 먼저). 체험판의 감사 기록(audit.js)도 같은 줄을 쓴다. 체험판은 모두 관리 계정(로그 수집 변경은 관리 권한)
export function seedHistory(now) {
  // 체험판: 마지막 저장의 새 sha는 지금 설정 파일의 sha(다음 저장의 '옛 sha'와 이어지게)
  const cur = (scope, k) => pickDemo(hex(k), seedSets().find((x) => x.scope === scope).sha.slice(0, 8));
  // 시연판: 시세 로그에서 숫자를 뽑아 붙인 저장(정보분배)이 하나 더 있다. id는 오래된 것부터
  if (SUMMIT) return [
    { id: 4, ts: now - 95 * MIN, actor: 'user:admin', action: 'collect.save', target: 'group:매매체결', detail: `group-매매체결.yaml ${hex('g0')} → ${cur('group:매매체결', 'g1')} 로그 파일 1개` },
    { id: 3, ts: now - 188 * MIN, actor: 'user:admin', action: 'collect.save', target: 'group:정보분배', detail: `group-정보분배.yaml - → ${cur('group:정보분배', 'q1')} 로그 파일 1개` },
    { id: 2, ts: now - 26 * 60 * MIN, actor: 'user:admin', action: 'collect.save', target: 'all', detail: `all.yaml ${hex('a0')} → ${cur('all', 'a1')} 로그 파일 1개` },
    { id: 1, ts: now - 30 * 60 * MIN, actor: 'user:admin', action: 'collect.save', target: 'all', detail: `all.yaml - → ${hex('a0')} 로그 파일 1개` },
  ];
  return [
    { id: 3, ts: now - 95 * MIN, actor: 'user:admin', action: 'collect.save', target: 'group:매매체결', detail: `group-매매체결.yaml ${hex('g0')} → ${cur('group:매매체결', 'g1')} 로그 파일 1개` },
    { id: 2, ts: now - 26 * 60 * MIN, actor: pickDemo('user:operator', 'user:admin'), action: 'collect.save', target: 'all', detail: `all.yaml ${hex('a0')} → ${cur('all', 'a1')} 로그 파일 1개` },
    { id: 1, ts: now - 30 * 60 * MIN, actor: 'user:admin', action: 'collect.save', target: 'all', detail: `all.yaml - → ${hex('a0')} 로그 파일 1개` },
  ];
}
export function reset() { S = null; }
// 씨앗의 기준 시각: 체험판은 세계를 만든 때, 아니면 처음 부른 때
const seedNow = (c) => (DEMO && c.w ? c.w.base : c.now);

const chain = (id, group) => {
  const segs = String(group || '').split('/').filter(Boolean);
  return ['all', ...segs.map((_, i) => 'group:' + segs.slice(0, i + 1).join('/')), 'host:' + id];
};
function effective(s, id, group) {
  const out = [];
  for (const sc of chain(id, group)) {
    const set = s.sets.find((x) => x.scope === sc);
    if (!set) continue;
    for (const l of set.logs) {
      const i = out.findIndex((o) => o.name === l.name);
      if (i >= 0) out[i] = { ...l, scope: sc }; else out.push({ ...l, scope: sc });
    }
  }
  return out;
}
const revOf = (logs) => hex(JSON.stringify(logs.map(({ name, path, match, metrics }) => ({ name, path, match, metrics }))), 16);

// 서버마다 정해 둔 상황: 대부분 적용됨, 하나는 적용 대기, 하나는 꺼짐, 하나는 실패(설정을 받지 못함), 하나는 모름.
// 일부 적용은 정해 두지 않는다: 경로가 허용 폴더(ROOTS) 밖인 로그 파일이 있으면 그 서버가 건너뛴다(실제 에이전트와 같게).
// 체험판: 정해 둔 상황 없음(서버 9대 모두 적용됨. 저장 · 삭제 직후 3초의 적용 대기는 그대로)
const SPECIAL = pick({ 'match-03': 'pending', 'ext-02': 'disabled', 'feed-04': 'failed', 'ext-04': 'unknown' }, {});
const LOCAL = [{ name: 'agent', path: '{log_dir}/eum-agent.log', match: [{ re: 'level=error', level: 'error' }], origin: 'local' }];
const ROOTS = ['/var/lib/eum/logs'];
// dw-01만 /data/etl을 허용해 두었다: 거기서 파일을 골라 그룹에 저장하면 마법사가 나머지 서버는 건너뛴다고 미리 알린다.
const rootsOf = (id) => (id === 'dw-01' ? [...ROOTS, '/data/etl'] : ROOTS);
const FETCH_ERR = '매니저에서 로그 수집 설정을 받지 못함: Get "https://eum-mgr:8080/api/v1/agent/config?host=feed-04": context deadline exceeded';
// 에이전트 dirOf와 같은 규칙: 와일드카드·{exec_id}가 든 첫 요소 앞까지, 없으면 파일이 든 폴더. {log_dir}는 ROOTS[0]
export function dirOf(path) {
  const elems = String(path).replace('{log_dir}', ROOTS[0]).split('/');
  let n = elems.length - 1;
  for (let i = 0; i < n; i++) if (/[*?]|\{exec_id\}/.test(elems[i])) { n = i; break; }
  return elems.slice(0, n).join('/') || '/';
}
const outside = (path, roots = ROOTS) => !roots.some((r) => dirOf(path) === r || dirOf(path).startsWith(r + '/'));

function hostRow(s, h, now) {
  const logs = effective(s, h.id, h.group);
  const want = revOf(logs);
  const sp = SPECIAL[h.id];
  const row = { host: h.id, group: h.group, want_rev: want, rev: want, state: 'applied', error: '', ts: now - 1000 * (3 + (hash32(h.id) % 50)), polled: now - 1000 * (1 + (hash32(h.id + 'p') % 20)) };
  if (sp === 'unknown') return { ...row, rev: '', state: 'unknown', ts: 0, polled: now - 3 * MIN };
  if (sp === 'disabled') return { ...row, rev: '', state: 'disabled' };
  row.read_roots = rootsOf(h.id);
  if (sp === 'failed') return { ...row, rev: 'c4e2a190b7d3f851', state: 'failed', error: FETCH_ERR, error_kind: 'fetch' };
  if (sp === 'pending') return { ...row, rev: 'a1b2c3d4e5f60718', state: 'pending' };
  const until = s.pendingUntil[h.id];
  if (until && until > now) return { ...row, rev: s.seen[h.id] || '', state: 'pending' };
  s.seen[h.id] = want;
  const skipped = logs.filter((l) => outside(l.path, row.read_roots)).length;
  if (skipped) return { ...row, state: 'partial', skipped };
  return row;
}

function statusOf(row, logs) {
  if (row.state === 'unknown') return null;
  const local = LOCAL.map((l) => ({ ...l, files: 1 }));
  if (row.state === 'disabled') {
    return { host: row.host, rev: '', state: 'disabled', ts: row.ts, read_roots: [], sources: local };
  }
  const remote = logs.map((l, i) => {
    const o = { name: l.name, path: l.path, match: l.match, ...(l.metrics && l.metrics.length ? { metrics: l.metrics } : {}), origin: 'remote', files: 1 + (hash32(l.name + row.host) % 3) };
    if (/\*/.test(l.path)) o.files = 2 + (hash32(row.host) % 4);
    if (row.state !== 'failed' && outside(l.path, row.read_roots)) Object.assign(o, { files: 0, why: 'outside', dir: dirOf(l.path), skipped: `읽어도 되는 폴더(read_roots) 밖: ${dirOf(l.path)}` });
    return o;
  });
  return { host: row.host, rev: row.rev, state: row.state, error: row.error, error_kind: row.error_kind, ts: row.ts, read_roots: row.read_roots, sources: [...local, ...remote] };
}

function list(c) {
  const s = state(seedNow(c));
  return ok({
    editable: true, dir: '/collect',
    sets: s.sets.map(({ scope, file, sha, logs }) => ({ scope, file, sha, logs })),
    errors: s.errors,
    hosts: c.w.hosts.map((h) => hostRow(s, h, c.now)),
  });
}
function hostDetail(c, m) {
  const s = state(seedNow(c));
  const h = c.w.hosts.find((x) => x.id === decodeURIComponent(m[1]));
  if (!h) return err(404, '서버를 찾을 수 없음');
  const row = hostRow(s, h, c.now);
  const logs = effective(s, h.id, h.group);
  return ok({ host: h.id, group: h.group, want_rev: row.want_rev, state: row.state, logs, status: statusOf(row, logs) });
}

// ---- 저장 ----
function problems(logs) {
  const out = [];
  const seen = new Set();
  const metricSeen = new Map();
  logs.forEach((l, i) => {
    if (!/^[a-z0-9][a-z0-9_.-]{0,39}$/.test(l.name || '')) out.push({ index: i, rule: -1, field: 'name', msg: '이름은 소문자·숫자·_.-만, 40자까지' });
    else if (seen.has(l.name)) out.push({ index: i, rule: -1, field: 'name', msg: `이름 중복: ${l.name}` });
    seen.add(l.name);
    if (!/^(\/|\{log_dir\})/.test(l.path || '')) out.push({ index: i, rule: -1, field: 'path', msg: '경로는 절대 경로나 {log_dir}로 시작' });
    if (!(l.match || []).length && !(l.metrics || []).length) out.push({ index: i, rule: -1, field: 'match', msg: '줄 규칙이나 지표가 하나 이상 있어야 합니다' });
    if ((l.metrics || []).length > 10) out.push({ index: i, rule: -1, field: 'metrics', msg: '지표는 10개까지입니다' });
    (l.metrics || []).forEach((m, k) => {
      if (!/^biz(\.[a-z0-9_]+)+$/.test(m.name || '') || m.name.length > 80) out.push({ index: i, rule: k, field: 'metric.name', msg: '지표 이름은 biz.로 시작하고 영문 소문자·숫자·_를 .로 이어 80자까지입니다(예 biz.quote.count_1m)' });
      else if (metricSeen.has(m.name)) out.push({ index: i, rule: k, field: 'metric.name', msg: `지표 ${m.name}를 logs[${metricSeen.get(m.name)}]에서 이미 냅니다` });
      else metricSeen.set(m.name, i);
      if (!['count', 'sum', 'max', 'last'].includes(m.agg)) out.push({ index: i, rule: k, field: 'metric.agg', msg: '계산은 count·sum·max·last 가운데 하나입니다' });
      if (!m.re) out.push({ index: i, rule: k, field: 'metric.re', msg: '정규식이 비어 있습니다' });
      else {
        try {
          const g = new RegExp(m.re + '|').exec('').length - 1;
          if (m.agg !== 'count' && g === 0) out.push({ index: i, rule: k, field: 'metric.re', msg: '숫자를 담을 묶음 ( )이 있어야 합니다(예 recv=(\\d+))' });
        } catch (e) { out.push({ index: i, rule: k, field: 'metric.re', msg: `정규식(RE2)을 해석하지 못함: ${e.message}` }); }
      }
      if (m.window && !/^(\d+m)?(\d+s)?$/.test(m.window)) out.push({ index: i, rule: k, field: 'metric.window', msg: '창은 1s·60s·5m 같은 기간입니다' });
    });
    (l.match || []).forEach((r, k) => {
      try { new RegExp(r.re); } catch (e) { out.push({ index: i, rule: k, field: 're', msg: `정규식 오류: ${e.message}` }); }
      if (r.level !== 'error' && r.level !== 'warn') out.push({ index: i, rule: k, field: 'level', msg: 'error 또는 warn' });
    });
  });
  return out;
}
const validScope = (sc) => sc === 'all' || /^group:.+/.test(sc) || /^host:.+/.test(sc);
function fileFor(s, scope) {
  const base = scope === 'all' ? 'all' : scope.replace(/^group:/, 'group-').replace(/^host:/, 'host-').replace(/\//g, '-').replace(/[^\w가-힣.-]/g, '_');
  let f = base + '.yaml', n = 2;
  while (s.sets.some((x) => x.file === f)) f = `${base}-${n++}.yaml`;
  return f;
}
function pushAudit(s, c, action, target, detail) {
  s.audit.unshift({ id: ++s.auditSeq, ts: c.now, actor: DEMO ? `user:${userId()}` : 'user:admin', action, target, detail });
  // 체험판: 감사 기록에도 남긴다(ops.js가 쌓는 모양)
  if (DEMO && c.w && c.w.audit) c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor: 'user:web(127.0.0.1)', action, target, detail });
}
// 시연판: 다시 읽기 · 로그 파일 찾기 · 미리보기도 감사 기록에 남긴다(매니저 collect/http.go와 같은 글. 로그 수집 화면의 변경 이력은 저장 · 삭제뿐이라 거기에는 넣지 않는다)
function note(c, action, target, detail) {
  if (SUMMIT && c.w && c.w.audit) c.w.audit.push({ id: c.w.audit.length + 1, ts: c.now, actor: 'user:web(127.0.0.1)', action, target, detail });
}
// 저장·삭제한 범위에 걸린 서버는 3초 동안 이전 판을 쓰는 적용 대기로 둔다.
function markPending(s, c, scope) {
  for (const h of c.w.hosts) {
    if (!chain(h.id, h.group).includes(scope)) continue;
    const row = hostRow(s, h, c.now);
    s.seen[h.id] = row.state === 'pending' ? row.rev : row.want_rev;
    s.pendingUntil[h.id] = c.now + 3000;
  }
}
function put(c) {
  const s = state(seedNow(c));
  const scope = c.q.get('scope') || '';
  if (!validScope(scope)) return err(400, '적용 대상 형식이 맞지 않음');
  const b = c.json();
  if (!b || !Array.isArray(b.logs)) return err(400, '본문이 맞지 않음');
  const probs = problems(b.logs);
  if (probs.length) return err(400, '로그 수집 설정에 문제가 있음', { problems: probs });
  const cur = s.sets.find((x) => x.scope === scope);
  if (cur && (b.if_match || '') !== cur.sha) return err(409, '다른 곳에서 먼저 고쳤음', { sha: cur.sha });
  if (!cur && b.if_match) return err(409, '다른 곳에서 먼저 지웠음', { sha: '' });
  markPending(s, c, scope);
  const sha = hex(JSON.stringify(b.logs) + scope + c.now, 64);
  const old = cur ? cur.sha.slice(0, 8) : '-';
  const set = cur || { scope, file: fileFor(s, scope), logs: [], sha: '' };
  set.logs = b.logs; set.sha = sha;
  if (!cur) s.sets.push(set);
  pushAudit(s, c, 'collect.save', scope, `${set.file} ${old} → ${sha.slice(0, 8)} 로그 파일 ${b.logs.length}개`);
  return ok({ scope, file: set.file, sha, logs: set.logs });
}
function del(c) {
  const s = state(seedNow(c));
  const scope = c.q.get('scope') || '';
  const i = s.sets.findIndex((x) => x.scope === scope);
  if (i < 0) return err(404, '그 적용 대상의 설정이 없음');
  if ((c.q.get('if_match') || '') !== s.sets[i].sha) return err(409, '다른 곳에서 먼저 고쳤음', { sha: s.sets[i].sha });
  markPending(s, c, scope);
  const [gone] = s.sets.splice(i, 1);
  pushAudit(s, c, 'collect.delete', scope, gone.file);
  return { status: 204, body: null };
}
function reload(c) {
  const s = state(seedNow(c));
  note(c, 'collect.reload', 'collect', `적용 대상 ${s.sets.length}개, 읽지 못한 파일 ${s.errors.length}개`);
  return ok({ sets: s.sets.length, errors: s.errors });
}
function history(c) {
  const s = state(seedNow(c));
  const scope = c.q.get('scope') || '';
  const limit = Number(c.q.get('limit')) || 50;
  return ok({ entries: s.audit.filter((e) => !scope || e.target === scope).slice(0, limit) });
}

// ---- 에이전트에 시키는 일 ----
// ago = 몇 분 전에 고쳤는지
const FILES = [
  { path: '/var/lib/eum/logs/matching_svc.01JC8M2Q4T9XK0A7V5N3B6D1ER.log', size: 48213377, ago: 0.1, origin: 'proc', pid: pickDemo(4121, 3121), comm: 'matching_svc', flow: 'market-open/start-matching', suggest: '{log_dir}/matching_svc.{exec_id}.log', allowed: true, name: 'matching' },
  { path: '/var/lib/eum/logs/feed_tick.20261110.log', size: 912884112, ago: 0.05, origin: 'root', suggest: '{log_dir}/feed_tick.*.log', allowed: true },
  { path: '/var/lib/eum/logs/gw/order_0003.log', size: 5821044, ago: 2, origin: 'root', suggest: '{log_dir}/gw/order_*.log', allowed: true, name: 'order-gw' },
  // 체험판: daily-settle은 아직 돌지 않았다 → 프로세스가 연 파일의 둘째 예는 fetch-ref › pull-ref가 남긴 ref_cache(세계의 그 상주 프로세스)
  pick({ path: '/var/lib/eum/logs/settle.01JC9A4D8R1MB6Y0S3W2K7N5JF.log', size: 220311, ago: 14, origin: 'proc', pid: 4388, comm: 'settle', flow: 'daily-settle/settle', suggest: '{log_dir}/settle.{exec_id}.log', allowed: true },
    { path: '/var/lib/eum/logs/ref_cache.01JC9A4D8R1MB6Y0S3W2K7N5JF.log', size: 220311, ago: 14, origin: 'proc', pid: 5210, comm: 'ref_cache', flow: 'fetch-ref/pull-ref', suggest: '{log_dir}/ref_cache.{exec_id}.log', allowed: true }),
  { path: '/var/lib/eum/logs/quote_feed.log', size: 3120441, ago: 0.02, origin: 'root', suggest: '{log_dir}/quote_feed.log', allowed: true, name: 'quote' },
  { path: '/var/log/syslog', size: 3318002, ago: 0.02, origin: 'syslog', suggest: '/var/log/syslog', allowed: true },
  { path: '/data/etl/load_2026-11-10.log', size: 7345120, ago: 30, origin: 'root', suggest: '/data/etl/load_*.log', allowed: false },
];
// 체험판: 예시 파일 이름 · 줄에 박힌 날짜(2026-11-10)를 오늘(화면이 보이는 지역 시간)로 바꾼다
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dated(c) {
  if (!DEMO) return (v) => v;
  const d = new Date(c.now), p2 = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  return (v) => String(v).split('2026-11-10').join(ymd).split('20261110').join(ymd.split('-').join(''))
    .split('Nov 10').join(`${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')}`);
}
function discover(c) {
  const b = c.json();
  const s = state(seedNow(c));
  const h = b && c.w.hosts.find((x) => x.id === b.host);
  if (!h) return err(404, '서버를 찾을 수 없음');
  if (SPECIAL[h.id] === 'disabled') return err(422, '원격 설정이 꺼져 있습니다(에이전트 YAML remote.enabled)');
  if (SPECIAL[h.id] === 'unknown') return err(504, '에이전트가 10초 안에 답하지 않음');
  const names = new Set(effective(s, h.id, h.group).map((l) => l.name));
  const day = dated(c);
  note(c, 'collect.discover', 'host:' + h.id, `후보 ${FILES.length}개`);
  return ok({
    files: FILES.map(({ ago, name, ...f }) => ({ ...f, path: day(f.path), mtime: Math.round(c.now - ago * MIN), tracked: name && names.has(name) ? name : undefined })),
  });
}
const LINES = [
  '(I) 2026-11-10 09:00:01 session open acct=A1021',
  '(I) 2026-11-10 09:00:01 order accepted id=88213',
  '(W) 2026-11-10 09:00:02 queue depth 812 (limit 1000)',
  '(I) 2026-11-10 09:00:02 order matched id=88213 qty=100',
  '(E) 2026-11-10 09:00:03 fill timeout id=88219 after 3000ms',
  '(I) 2026-11-10 09:00:03 heartbeat ok',
  '    at matcher.Book.cross(book.go:211)',
  '(W) 2026-11-10 09:00:04 slow tick 142ms',
  '(I) 2026-11-10 09:00:05 order accepted id=88220',
  '(E) 2026-11-10 09:00:06 reject id=88221 reason=price band',
  '(I) 2026-11-10 09:00:06 heartbeat ok',
  'ERROR 2026-11-10 09:00:07 unexpected EOF from feed',
  'WARN 2026-11-10 09:00:07 reconnect attempt 2',
  '[ERROR] 2026-11-10 09:00:08 retry exhausted',
  '[INFO] 2026-11-10 09:00:08 closing session',
  '(I) 2026-11-10 09:00:09 order matched id=88220 qty=300',
];
const SYSLOG = [
  'Nov 10 09:00:01 match-01 systemd[1]: Started Daily apt download activities.',
  'Nov 10 09:00:02 match-01 settle[4388]: batch step 3 done rows=88201',
  'Nov 10 09:00:03 match-01 kernel: [412.3] eth0: link up',
  'Nov 10 09:00:04 match-01 settle[4388]: error: row 88202 checksum mismatch',
  'Nov 10 09:00:05 match-01 CRON[991]: (root) CMD (/usr/bin/logrotate)',
  'Nov 10 09:00:06 match-01 sshd[1204]: Accepted publickey for ops from 10.0.1.20',
  'Nov 10 09:00:07 match-01 settle[4388]: warning: slow disk 480ms',
  'Nov 10 09:00:08 match-01 systemd[1]: Started Session 112 of user ops.',
];
// 시세 로그: 1초마다 통계 줄, 가끔 다른 줄
function quoteLine(i) {
  const t = `2026-11-10 09:01:${String((i * 1) % 60).padStart(2, '0')}`;
  if (i % 12 === 5) return `${t} [INFO] session keepalive ok peer=krx-feed-a`;
  const recv = 1400 + (hash32('q' + i) % 900);
  return `${t} [STAT] recv=${recv.toLocaleString('en-US')} send=${recv.toLocaleString('en-US')} lost=${i % 17 === 9 ? 3 : 0}`;
}
function peek(c) {
  const b = c.json();
  const h = b && c.w.hosts.find((x) => x.id === b.host);
  if (!h) return err(404, '서버를 찾을 수 없음');
  if (SPECIAL[h.id] === 'disabled') return err(422, '원격 설정이 꺼져 있습니다(에이전트 YAML remote.enabled)');
  const path = String(b.path || '');
  if (outside(path, rootsOf(h.id))) return err(422, `이 서버가 읽어도 되는 폴더(read_roots: ${rootsOf(h.id).join(', ')}) 밖입니다: ${dirOf(path)}`);
  const n = Math.max(1, Math.min(500, Number(b.lines) || 200));
  const quote = /quote/.test(path);
  const base = /syslog/.test(path) ? SYSLOG : LINES;
  const day = dated(c);
  const lines = Array.from({ length: Math.min(n, 48) }, (_, i) => day(quote ? quoteLine(i) : base[i % base.length]));
  const file = day(path.replace('{log_dir}', '/var/lib/eum/logs').replace('{exec_id}', '01JC8M2Q4T9XK0A7V5N3B6D1ER').replace('*', '20261110'));
  note(c, 'collect.peek', 'host:' + h.id, `${file} ${lines.length}줄`);
  return ok({ file, lines, size: 48213377, rate: /tick/.test(path) ? 870 : quote ? 1.1 : 12.5 });
}

export const routes = [
  ['GET', /^\/collect$/, list],
  ['PUT', /^\/collect$/, put],
  ['DELETE', /^\/collect$/, del],
  ['POST', /^\/collect\/reload$/, reload],
  ['POST', /^\/collect\/discover$/, discover],
  ['POST', /^\/collect\/peek$/, peek],
  ['GET', /^\/collect\/history$/, history],
  ['GET', /^\/collect\/hosts\/([^/]+)$/, hostDetail],
];
