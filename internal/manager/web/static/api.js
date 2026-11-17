// api(path, opts) · poll(fn, ms, opts) · 시계 점 상태 · 갱신 끊김 집계. DOM 없이도 import된다.
import { handle as mockHandle } from './mock/index.js';
import { LITE, SUMMIT } from './mock/profile.js';

const hasWin = () => typeof location !== 'undefined';

export function isMock() {
  if (!hasWin()) return false;
  try {
    if (new URLSearchParams(location.search).get('mock') === '1') return true;
    // 해시 쪽 쿼리(#dashboard?mock=1)도 본다.
    const h = location.hash.split('?')[1];
    if (h && new URLSearchParams(h).get('mock') === '1') return true;
  } catch (e) { /* 무시 */ }
  try { return localStorage.mock === '1'; } catch (e) { return false; }
}
// 체험판: mock이면서 lite 프로필(mock/profile.js). 이때만 화면 위 가이드(guide/)를 불러온다.
export function isDemo() { return isMock() && LITE; }
// 써밋 시연판: mock이면서 summit 프로필. 이때만 발표자용 순서 가이드(guide/stage.js)를 불러온다.
export function isSummit() { return isMock() && SUMMIT; }

const healthListeners = new Set();
let healthy = true;
export function onHealth(fn) { healthListeners.add(fn); return () => healthListeners.delete(fn); }
export function isHealthy() { return healthy; }
function setHealth(ok) {
  healthy = ok;
  for (const fn of healthListeners) { try { fn(ok); } catch (e) { /* 무시 */ } }
}

export class ApiError extends Error {
  // body는 오류 응답 본문(객체면 그대로, 예: 400의 problems)이다.
  constructor(status, error, need, body) { super(`${status} ${error}`); this.status = status; this.error = error; this.need = need || ''; this.body = body ?? null; }
}

// 401(세션 없음·만료)과 403(역할 부족)을 앱에 알린다. 로그인 요청 자체의 401은 제외.
const authListeners = new Set(), forbidListeners = new Set();
export function onAuthRequired(fn) { authListeners.add(fn); return () => authListeners.delete(fn); }
export function onForbidden(fn) { forbidListeners.add(fn); return () => forbidListeners.delete(fn); }
function notifyStatus(path, status, need) {
  if (status === 401 && path !== '/login') for (const fn of authListeners) { try { fn(); } catch (e) { /* 무시 */ } }
  if (status === 403 && need) for (const fn of forbidListeners) { try { fn(need); } catch (e) { /* 무시 */ } }
}

// api('/hosts') → 본문 객체. opts: {method, body}
export async function api(path, opts = {}) {
  const method = opts.method || 'GET';
  let res;
  try {
    if (isMock()) {
      const search = hasWin() ? location.search : '';
      res = await mockHandle(path, { method, body: opts.body, search });
      if (res.contentType && typeof res.body === 'string') { setHealth(true); return res.body; }
      if (res.status < 200 || res.status >= 300) {
        setHealth(res.status < 500);
        notifyStatus(path, res.status, res.body && res.body.need);
        throw new ApiError(res.status, (res.body && res.body.error) || '', res.body && res.body.need, res.body);
      }
      setHealth(true);
      return res.body;
    }
    const init = { method, headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    const r = await fetch('/api/v1' + path, init);
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    setHealth(r.status < 500); // 5xx는 응답이 와도 실패로 본다. 4xx는 서버가 살아 있다
    if (!r.ok) {
      notifyStatus(path, r.status, body && body.need);
      throw new ApiError(r.status, (body && body.error) || String(text).slice(0, 200), body && body.need, body);
    }
    return body;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    setHealth(false);
    throw new ApiError(0, e && e.message ? e.message : String(e));
  }
}

// ---- 갱신 끊김 집계 ----
// 살아 있는 poll마다 {fails, failing, lastOk, since}를 둔다. 실패(상태 0 또는 5xx)가 2번 이어지면 끊김,
// 성공하거나 4xx(서버는 응답함)를 받으면 풀린다. 그 밖의 예외(화면 코드 오류)는 세지 않는다.
const FAIL_AFTER = 2;
const live = new Set();
const pollListeners = new Set();
let lastSig = '';
function aggregate() {
  const bad = [...live].filter((p) => p.failing);
  // lastOk: 끊긴 poll들의 마지막 성공 시각 중 가장 이른 것(한 번도 성공 못 했으면 그 poll을 시작한 시각)
  const lastOk = bad.length ? Math.min(...bad.map((p) => p.lastOk || p.since)) : null;
  return { failing: bad.length > 0, lastOk, fails: bad.length };
}
function notifyPoll() {
  const st = aggregate();
  const sig = `${st.failing}|${st.lastOk}|${st.fails}`;
  if (sig === lastSig) return;
  lastSig = sig;
  for (const fn of pollListeners) { try { fn(st); } catch (e) { /* 무시 */ } }
}
// 갱신 끊김 상태를 듣는다: fn({failing, lastOk, fails}) — fails는 끊긴 poll 수. 반환값은 해제 함수.
export function onPollState(fn) { pollListeners.add(fn); return () => pollListeners.delete(fn); }
export function pollState() { return aggregate(); }
const isCut = (e) => e instanceof ApiError && (e.status === 0 || e.status >= 500);
const isClientErr = (e) => e instanceof ApiError && e.status >= 400 && e.status < 500;

// 주기 갱신. fn을 바로 한 번 부르고 ms마다 반복한다. 숨겨진 탭이면 쉰다.
// 반환값은 멈춤 함수. scope 안에서 만든 것은 stopScope()로 한꺼번에 멈춘다.
// opts: {global: 화면을 옮겨도 계속, onError(e): 실패할 때마다 부른다}
let scope = new Set();
export function poll(fn, ms, opts = {}) {
  let stopped = false;
  let busy = false;
  const st = { fails: 0, failing: false, lastOk: 0, since: Date.now() };
  live.add(st);
  const run = async () => {
    if (stopped || busy || (typeof document !== 'undefined' && document.hidden)) return;
    busy = true;
    try {
      await fn();
      if (!stopped) { st.fails = 0; st.failing = false; st.lastOk = Date.now(); notifyPoll(); }
    } catch (e) {
      // 다음 주기에 다시 시도
      if (!stopped) {
        if (opts.onError) { try { opts.onError(e); } catch (e2) { /* 무시 */ } }
        if (isCut(e)) { st.fails++; st.failing = st.fails >= FAIL_AFTER; notifyPoll(); }
        else if (isClientErr(e)) { st.fails = 0; st.failing = false; notifyPoll(); }
      }
    }
    busy = false;
  };
  const id = setInterval(run, ms);
  run();
  const stop = () => {
    stopped = true; clearInterval(id); scope.delete(stop);
    if (live.delete(st)) notifyPoll();
  };
  if (!opts.global) scope.add(stop);
  return stop;
}
export function stopScope() {
  for (const s of [...scope]) s();
  scope = new Set();
}

// 업무 패널 폴더 다시 읽기(관리). → {panels: 읽은 수, errors: [{file, msg}]}
export function reloadPanels() { return api('/panels/reload', { method: 'POST' }); }
