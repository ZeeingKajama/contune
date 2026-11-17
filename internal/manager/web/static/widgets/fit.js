// 위젯 안 줄 맞춤(P7): 칸에 다 들어가지 않는 줄은 그리지 않고 아래에 `외 N`을 둔다.
// 막대·벽면의 목록·표는 이것으로, 벽면이 아닌 표·로그는 안에서 스크롤하고 아래 끝 흐림(more 클래스)으로 더 있음을 보인다.
const MORE_H = 22; // `외 N` 줄 높이(px)

// view: 높이를 정하는 요소(position:relative). groups: 줄마다 요소 묶음(그린 순서). 숨긴 줄 수를 돌려준다
export function fitRows(view, groups) {
  const old = view.querySelector(':scope > .fit-more');
  if (old) old.remove();
  const all = groups.flat();
  all.forEach((x) => { x.hidden = false; });
  const H = view.clientHeight;
  if (!all.length || !H) return 0;
  const top = view.getBoundingClientRect().top;
  const bottoms = groups.map((g) => Math.max(...g.map((x) => x.getBoundingClientRect().bottom)) - top + view.scrollTop);
  if (bottoms.every((b) => b <= H + 1)) return 0;
  let n = 0;
  for (const b of bottoms) { if (b > H - MORE_H) break; n++; }
  n = Math.max(1, n);
  groups.forEach((g, i) => g.forEach((x) => { x.hidden = i >= n; }));
  const hid = groups.length - n;
  if (hid > 0) {
    const m = document.createElement('div');
    m.className = 'fit-more';
    m.textContent = `외 ${hid}`;
    view.append(m);
  }
  return hid;
}

// 몸통(.dw-b) 안의 줄 맞춤. tv(벽면)이면 스크롤하는 목록·표도 줄을 줄이고, 아니면 스크롤 + 흐림
export function fitBody(body, tv) {
  const bars = body.querySelector('.mw-bars');
  if (bars) {
    const kids = [...bars.children], g = [];
    for (let i = 0; i < kids.length; i += 3) g.push(kids.slice(i, i + 3));
    fitRows(body.querySelector('.mw-bar'), g);
    return;
  }
  const sc = body.querySelector('.mw-table, .dwg-list, .wl');
  if (!sc) { body.classList.remove('more'); return; }
  if (tv) {
    sc.classList.add('fit-tv');
    const rows = [...sc.querySelectorAll('tbody > tr, :scope > .dwg-lr, :scope > .dwg-sr, :scope > .wrow')];
    fitRows(sc, rows.map((r) => [r]));
    body.classList.remove('more');
    return;
  }
  sc.classList.remove('fit-tv');
  body.classList.toggle('more', sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2);
}
