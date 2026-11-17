// mock.handle(path, opts) → Promise<{status, body, contentType?}>
// path는 '/api/v1' 뒤 경로(쿼리 포함), opts는 {method, body, now, search}. DOM 없이 import된다.
import { parseQuery } from './util.js';
import { DEMO, SUMMIT } from './profile.js';
import { getWorld, reset as resetWorld, tick, summitFlags } from './world.js';
import * as core from './core.js';
import * as server from './server.js';
import * as ops from './ops.js';
import * as editor from './editor.js';
import * as biz from './biz.js';
import * as alert from './alert.js';
import * as auth from './auth.js';
import * as audit from './audit.js';
import * as collect from './collect.js';
import * as exit from './exit.js';
import * as procs from './procs.js';
import * as services from './services.js';
import * as dash from './dash.js';

const ROUTES = [auth, audit, core, server, ops, editor, biz, alert, collect, exit, procs, services, dash].flatMap((m) => m.routes);

function pageFlags(opts, q) {
  const s = new URLSearchParams(opts.search ?? (typeof location !== 'undefined' ? location.search : ''));
  const get = (k) => (q.get(k) !== null ? q.get(k) : s.get(k));
  return {
    surge: get('surge') !== '0',
    llm: DEMO ? get('llm') !== '0' : get('llm') === '1', // 체험판은 llm=0이 아니면 켠다(브리핑 · 초안이 AI로 보이게)
    rule: get('rule') === '1',
    editor: get('editor') !== '0',
    role: get('role'),
    login: get('login') === '1',
    hold: get('hold') || '', // 미리보기: 처음부터 용인해 둘 요인(쉼표 목록)
    llmOff: get('llm') === '0', // 종료 보고서: LLM 없음 미리보기(기본은 mock LLM 있음)
    core: get('core') || '', // 종료 보고서: builtin이면 내장 분석(추정 칸)
  };
}

// 실패 화면 확인용 깃발(주소 쿼리와 해시 쿼리 둘 다 본다): ?fail=/alerts,/hosts → 그 경로로 시작하는 요청에 500, ?slow=<ms> → 모든 응답을 늦춘다
function testFlag(opts, k) {
  const s = new URLSearchParams(opts.search ?? (typeof location !== 'undefined' ? location.search : ''));
  if (s.get(k) !== null) return s.get(k);
  if (typeof location === 'undefined') return null;
  const h = String(location.hash || '').split('?')[1];
  return h ? new URLSearchParams(h).get(k) : null;
}

export function reset() {
  resetWorld();
  collect.reset();
  dash.reset();
}

export async function handle(path, opts = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  const { pathname, q } = parseQuery(path);
  const slow = Number(testFlag(opts, 'slow'));
  if (slow > 0) await new Promise((r) => setTimeout(r, slow));
  const fail = (testFlag(opts, 'fail') || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (fail.some((p) => pathname.startsWith(p))) return { status: 500, body: { error: 'mock 실패' } };
  const now = opts.now || Date.now();
  const w = getWorld(now);
  const flags = pageFlags(opts, q);
  if (SUMMIT) summitFlags(w, flags);
  tick(w, now);
  const raw = opts.body;
  const c = {
    w,
    now,
    q,
    flags,
    method,
    sig: { now, surge: flags.surge, base: w.base }, // base: 지난 시세 폭주처럼 세계에 고정된 시각의 기준
    text: () => (raw === undefined || raw === null ? '' : typeof raw === 'string' ? raw : JSON.stringify(raw)),
    json: () => {
      if (raw && typeof raw === 'object') return raw;
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
  };
  const blocked = auth.guard(c, pathname);
  if (blocked) return blocked;
  for (const [m, re, fn] of ROUTES) {
    if (m !== method) continue;
    const mm = re.exec(pathname);
    if (mm) {
      try {
        if (!SUMMIT) return fn(c, mm);
        // 시연판: 이 요청이 남긴 감사 기록에 그때 로그인한 사용자를 적어 둔다(역할을 바꿔 다시 로그인해도 앞 조작의 '누가'가 바뀌지 않게, audit.js)
        const n0 = w.audit.length, who = auth.userId();
        const res = fn(c, mm);
        for (let i = n0; i < w.audit.length; i++) if (w.audit[i].by === undefined) w.audit[i].by = who;
        return res;
      } catch (e) {
        return { status: 500, body: { error: `mock 오류: ${e.message}` } };
      }
    }
  }
  return { status: 404, body: { error: 'mock 없음' } };
}

export default { handle, reset };
