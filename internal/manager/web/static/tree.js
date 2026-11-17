// 왼쪽 트리(서버 / 배치판)와 주소 해석. 집계·주소 해석은 DOM 없이 호출된다.
import { api, poll } from './api.js';
import { el, LEVEL_TEXT } from './ui.js';
import { groupCmp, groupOrderKey, loadGroupOrder } from './grouporder.js';

// ---- 순수 함수 ----
export const HOST_ORDER = ['crit', 'silent', 'warn', 'ok'];
export const HOST_TEXT = LEVEL_TEXT;
export const FLOW_ORDER = ['FAILED', 'RUNNING', 'SCHEDULED', 'SUCCEEDED'];
export const FLOW_TEXT = { FAILED: '실패', RUNNING: '실행 중', SCHEDULED: '예정', SUCCEEDED: '성공' };

export function flowState(f) {
  const s = f.last && f.last.status;
  if (!s) return 'SCHEDULED';
  if (s === 'FAILED' || s === 'KILLED') return 'FAILED';
  if (s === 'SUCCEEDED') return 'SUCCEEDED';
  if (s === 'RUNNING') return 'RUNNING';
  return 'SCHEDULED';
}

function newNode(key, label, path) {
  return { key, label, path, kind: 'group', children: new Map(), counts: {}, total: 0 };
}
function addCount(node, st) { node.counts[st] = (node.counts[st] || 0) + 1; node.total++; }

// kind: 'host' | 'flow'. 반환: 뿌리 노드(자식 Map). 잎에는 item.
function build(items, pathOf, idOf, stateOf, kind) {
  const root = newNode(kind, kind === 'host' ? '서버' : '배치판', '');
  for (const it of items) {
    const segs = String(pathOf(it) || '').split('/').filter(Boolean);
    if (!segs.length) segs.push('미분류');
    const st = stateOf(it);
    let cur = root;
    addCount(cur, st);
    let p = '';
    for (const s of segs) {
      p = p ? p + '/' + s : s;
      if (!cur.children.has(s)) cur.children.set(s, newNode(p, s, p));
      cur = cur.children.get(s);
      addCount(cur, st);
    }
    const leaf = newNode(idOf(it), idOf(it), p);
    leaf.kind = kind; leaf.item = it; addCount(leaf, st);
    cur.children.set('\u0000' + idOf(it), leaf);
  }
  return root;
}
export const buildHostTree = (hosts) => build(hosts, (h) => h.group, (h) => h.id, (h) => h.state, 'host');
export const buildFlowTree = (flows) => build(flows, (f) => f.board, (f) => f.id, flowState, 'flow');

// 노드 요약: 정상이 아닌 상태를 나쁜 순서로 "위험 1 · 무응답 1". worst는 가장 나쁜 상태.
export function summarize(counts, kind) {
  const order = kind === 'host' ? HOST_ORDER : FLOW_ORDER;
  const text = kind === 'host' ? HOST_TEXT : FLOW_TEXT;
  const okState = kind === 'host' ? 'ok' : 'SUCCEEDED';
  const parts = [];
  let worst = okState;
  for (const st of order) {
    if (st === okState || !counts[st]) continue;
    if (worst === okState) worst = st;
    parts.push({ state: st, text: `${text[st]} ${counts[st]}` });
  }
  return { worst, parts, label: parts.map((p) => p.text).join(' · ') };
}

// 주소 해석. boards: 배치판 경로 집합(Set). 반환 {name, params}
export function parseRoute(hash, boards = new Set()) {
  const raw = String(hash || '').replace(/^#/, '');
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const segs = path.split('/').map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
  const head = segs[0] || 'dashboard';
  let name = head, params = {};
  switch (head) {
    case 'dashboard': break;
    case 'hosts': break;
    case 'host': params = { id: segs[1] || '', tab: segs[2] || 'cpu' }; break;
    case 'board': {
      const rest = segs.slice(1).filter((s) => s !== '');
      const full = rest.join('/');
      if (!rest.length || boards.has(full)) params = { board: full, flow: '' };
      else params = { board: rest.slice(0, -1).join('/'), flow: rest[rest.length - 1] };
      break;
    }
    case 'edit': params = { flow: segs[1] || '' }; break;
    case 'biz': params = { panel: segs[1] || '' }; break;
    case 'runs': break;
    case 'exits': break;
    case 'run': params = { id: segs[1] || '' }; break;
    case 'svc': params = { id: segs[1] || '' }; break; // 서비스 타임머신 #svc/<id>?host=&from=&to= (06, 카드 P-F)
    case 'svcs': break; // 서비스 목록
    case 'dashes': break; // 사용자 보드: 마지막에 본 보드로(07)
    case 'dash': params = { id: segs[1] || '' }; break; // 보드 보기 #dash/<id>?tv=1&from=&to=
    case 'dashedit': params = { id: segs[1] || '' }; break; // 보드 편집 #dashedit/<id>, 새 보드 #dashedit/?from=<템플릿>
    case 'alerts': break;
    case 'risk': break;
    case 'audit': break;
    case 'collect': break;
    case 'dev': name = segs[1] === 'flame' ? 'dev/flame' : 'dashboard'; break;
    default: name = 'dashboard';
  }
  return { name, params, query };
}

export function hashWith(path, query) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') p.set(k, v);
  const s = p.toString();
  return '#' + path + (s ? '?' + s : '');
}

// ---- DOM ----
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 편의 기능일 뿐 */ } },
};

export function createTree(host, { onBoards } = {}) {
  let hosts = [], flows = [];
  let collapsed = store.get('eum.tree.collapsed', {});
  const sig = { s: '' };
  let q = '', onlyBad = false; // 찾기: 이름 부분 일치 · 이상만
  const filtering = () => q !== '' || onlyBad;

  // 맨 위 찾기 칸은 한 번만 만든다(5초 갱신에도 입력 값·포커스가 남게). 아래 list만 다시 그린다.
  const input = el('input', { type: 'search', 'aria-label': '서버·플로우 찾기', placeholder: '서버·플로우 찾기', autocomplete: 'off' });
  const badBtn = el('button', { type: 'button', text: '이상만', 'aria-pressed': 'false', title: '정상·성공이 아닌 것만' });
  const find = el('div', { class: 'tree-find' }, input, badBtn);
  const list = el('div', { role: 'tree', 'aria-label': '서버·배치판' });
  host.replaceChildren(find, list);
  input.addEventListener('input', () => { q = input.value.trim().toLowerCase(); render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { const f = list.querySelector('[role=treeitem]'); if (f) { e.preventDefault(); f.focus(); } }
    else if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; q = ''; render(); }
  });
  badBtn.addEventListener('click', () => { onlyBad = !onlyBad; badBtn.setAttribute('aria-pressed', String(onlyBad)); render(); });

  function curQuery() {
    const [, qs = ''] = location.hash.split('?');
    return Object.fromEntries(new URLSearchParams(qs));
  }
  function go(h) { if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h; }

  function selectGroup(path) {
    const [p] = location.hash.slice(1).split('?');
    const base = /^(hosts|dashboard|biz|alerts|risk)/.test(p) ? p : 'hosts';
    const q = curQuery(); q.g = path;
    go(hashWith(base, q));
  }
  function clearScope() {
    const q = curQuery(); delete q.g;
    const [p] = location.hash.slice(1).split('?');
    if (p.startsWith('board/')) return go(hashWith('board/', {}));
    go(hashWith(p, q));
  }

  function row(node, depth, kind, rootKey) {
    const sm = summarize(node.counts, kind);
    const isLeaf = node.kind !== 'group';
    const hasKids = !isLeaf && node.children.size > 0;
    const ck = rootKey + ':' + node.key;
    const open = filtering() ? true : !collapsed[ck];
    const cur = curQuery().g;
    const [hp] = location.hash.slice(1).split('?');
    const selected = (kind === 'host' && !isLeaf && cur === node.path) ||
      (kind === 'host' && isLeaf && hp.startsWith('host/' + node.item.id)) ||
      (kind === 'flow' && ('board/' + node.path === hp || (isLeaf && hp === 'board/' + node.path + '/' + node.item.id)));
    const toggle = () => { collapsed[ck] = open; store.set('eum.tree.collapsed', collapsed); render(); };
    const r = el('div', { class: 'tnode' + (selected ? ' sel' : ''), style: `padding-left:${4 + depth * 14}px`,
      role: 'treeitem', tabindex: '-1', 'aria-level': String(depth + 1), 'data-fk': ck,
      'aria-expanded': hasKids ? String(open) : false, 'aria-current': selected ? 'page' : false },
      el('span', { class: 'tw', 'aria-hidden': 'true', text: hasKids ? (open ? '▾' : '▸') : '', onclick: (e) => { e.stopPropagation(); toggle(); } }),
      el('span', { class: 'tl', text: node.label, title: node.label }));
    if (sm.parts.length) {
      const b = el('span', { class: 'tb' });
      sm.parts.forEach((p, i) => {
        if (i) b.append(' · ');
        b.append(el('span', { class: 'badge ' + (kind === 'host' ? p.state : p.state.toLowerCase()), text: p.text }));
      });
      r.append(b);
    }
    r._toggle = hasKids ? toggle : null;
    r.addEventListener('click', () => {
      if (kind === 'host') {
        if (isLeaf) go(`#host/${encodeURIComponent(node.item.id)}/overview`);
        else selectGroup(node.path);
      } else if (isLeaf) go('#board/' + node.path.split('/').map(encodeURIComponent).join('/') + '/' + encodeURIComponent(node.item.id));
      else go('#board/' + node.path.split('/').map(encodeURIComponent).join('/'));
    });
    return { r, open: open && hasKids };
  }

  function walk(node, depth, kind, rootKey, out) {
    const kids = [...node.children.values()].sort((a, b) => {
      if ((a.kind === 'group') !== (b.kind === 'group')) return a.kind === 'group' ? -1 : 1;
      if (kind === 'host' && a.kind === 'group') return groupCmp(a.path, b.path); // 서버 그룹은 업무 순서(grouporder.js)
      return a.label < b.label ? -1 : 1;
    });
    for (const k of kids) {
      const { r, open } = row(k, depth, kind, rootKey);
      out.push(r);
      if (open) walk(k, depth + 1, kind, rootKey, out);
    }
  }

  function render() {
    const out = [];
    const cq = curQuery();
    const [hp] = location.hash.slice(1).split('?');
    let chip = null;
    if (cq.g) chip = cq.g.split('/').pop();
    else if (hp.startsWith('board/') && hp.length > 6) chip = null;
    if (chip) out.push(el('div', { class: 'tree-chip' }, chip, el('button', { type: 'button', text: '✕', title: '범위 해제', onclick: clearScope })));
    // 배치 쪽 화면이면 배치판을 위에 둔다(서버 46대 아래에 묻히지 않게).
    const bad = (st, ok) => st !== ok;
    const keep = (id) => !q || String(id).toLowerCase().includes(q);
    const fh = filtering() ? hosts.filter((h) => keep(h.id) && (!onlyBad || bad(h.state, 'ok'))) : hosts;
    const ff = filtering() ? flows.filter((f) => keep(f.id) && (!onlyBad || bad(flowState(f), 'SUCCEEDED'))) : flows;
    const roots = [['host', '서버', buildHostTree(fh)], ['flow', '배치판', buildFlowTree(ff)]];
    if (/^(board|edit|runs|run)(\/|$)/.test(hp)) roots.reverse();
    for (const [kind, label, root] of roots) {
      const sm = summarize(root.counts, kind);
      const ck = 'root:' + kind;
      const open = filtering() ? true : !collapsed[ck];
      const toggle = () => { collapsed[ck] = open; store.set('eum.tree.collapsed', collapsed); render(); };
      const head = el('div', { class: 'tnode troot', role: 'treeitem', tabindex: '-1', 'aria-level': '1', 'aria-expanded': String(open), 'data-fk': ck },
        el('span', { class: 'tw', 'aria-hidden': 'true', text: open ? '▾' : '▸' }),
        el('span', { class: 'tl', text: label }),
        el('span', { class: 'num unit', text: String(root.total) }));
      void sm;
      head._toggle = toggle;
      head.addEventListener('click', toggle);
      out.push(head);
      if (open) walk(root, 1, kind, kind, out);
    }
    if (filtering() && !out.some((n) => n.getAttribute && n.getAttribute('aria-level') > 1)) out.push(el('div', { class: 'tree-none', text: '맞는 항목 없음' }));
    // 다시 그려도 포커스는 같은 노드에(roving tabindex: 포커스 노드, 없으면 지금 화면, 없으면 첫 노드)
    const fk = list.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    const sc = host.scrollTop;
    list.replaceChildren(...out);
    const items = [...list.querySelectorAll('[role=treeitem]')];
    const tab = (fk && items.find((n) => n.dataset.fk === fk)) || list.querySelector('[aria-current]') || items[0];
    if (tab) tab.tabIndex = 0;
    if (fk && tab && tab.dataset.fk === fk) tab.focus({ preventScroll: true });
    host.scrollTop = sc;
  }

  // 키보드: ↑↓ 이동, → 펼침(펼친 묶음이면 첫 자식), ← 접힘(아니면 부모), Enter·Space 이동
  list.addEventListener('keydown', (e) => {
    const cur = e.target.closest && e.target.closest('[role=treeitem]');
    if (!cur) return;
    const items = [...list.querySelectorAll('[role=treeitem]')];
    const i = items.indexOf(cur), lvl = Number(cur.getAttribute('aria-level'));
    const go2 = (n) => { if (n) { e.preventDefault(); n.focus(); } };
    const exp = cur.getAttribute('aria-expanded');
    switch (e.key) {
      case 'ArrowDown': go2(items[i + 1]); break;
      case 'ArrowUp': if (i === 0) { e.preventDefault(); input.focus(); } else go2(items[i - 1]); break;
      case 'Home': go2(items[0]); break;
      case 'End': go2(items[items.length - 1]); break;
      case 'ArrowRight':
        if (exp === 'false') { e.preventDefault(); cur._toggle && cur._toggle(); } else if (exp === 'true') go2(items[i + 1]);
        break;
      case 'ArrowLeft':
        if (exp === 'true' && !filtering()) { e.preventDefault(); cur._toggle && cur._toggle(); }
        else { for (let k = i - 1; k >= 0; k--) if (Number(items[k].getAttribute('aria-level')) < lvl) { go2(items[k]); break; } }
        break;
      case 'Enter': case ' ': e.preventDefault(); cur.click(); break;
      default: break;
    }
  });
  list.addEventListener('focusin', (e) => {
    const n = e.target.closest && e.target.closest('[role=treeitem]');
    if (!n) return;
    list.querySelectorAll('[role=treeitem][tabindex="0"]').forEach((x) => { if (x !== n) x.tabIndex = -1; });
    n.tabIndex = 0;
  });

  async function load() {
    const [h, f] = await Promise.all([api('/hosts'), api('/flows'), loadGroupOrder()]);
    hosts = h.hosts || []; flows = f.flows || [];
    onBoards?.(new Set(flows.map((x) => x.board)));
    const s = JSON.stringify([hosts.map((x) => [x.id, x.state, x.group]), flows.map((x) => [x.id, flowState(x), x.board]), groupOrderKey()]);
    if (s !== sig.s) { sig.s = s; render(); }
  }
  const ready = load().catch(() => {});
  poll(load, 5000, { global: true });
  window.addEventListener('hashchange', render);
  return { ready, refresh: render };
}
