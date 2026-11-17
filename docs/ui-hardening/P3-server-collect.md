# P3. 서버·로그 수집 (sonnet)

가지 `ui/p3-server`, 워크트리 `.claude/worktrees/ui-p3`, 포트 8813. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `pages/server.js`, `pages/collect.js`, `pages/collectwiz.js`, `css/server.css`, `css/collect.css`, `mock/server.js`, `mock/collect.js`, `mock/procs.js`.

## 서버 목록 (`#hosts`)

1. **정렬 표시**(:132-138): 정렬되는 머리는 `<th>` 안의 `<button>`으로, 안 고른 칸에도 흐린 `↕`. `aria-sort`. 키보드로 눌려야 한다.
2. **찾기·거르기**: 표 위에 이름 찾기 칸과 상태 칩(`전체 46` `이상 3`…, 실행 화면의 칩 모양을 따른다).
3. **주소에 남기기**: 정렬(`sort`, `dir`)·찾기(`q`)·상태(`st`)를 `setQuery`로.
4. **넓은·좁은 화면**: 표 최대 폭 1600px(2560px에서 끝까지 늘어난다). 700px 이하에서는 `.tblwrap`으로 가로 스크롤하고 그룹 이름이 세로로 꺾이지 않게(`nowrap`), 서버 이름 칸은 왼쪽에 고정(`position:sticky`).
5. **갱신**(:144→:142, 5초): `changed()` + `keepFocus()`. 머리는 스크롤해도 보이게(`position:sticky`).

## 서버 상세 (`#host/<id>/…`)

6. **무방비 await**(:159, :484의 `/catalog`·`/runs`): 실패하면 화면 전체가 `화면을 그리지 못함`이 된다 → 그 탭 안에서 `stateBox('error', {e, retry})`.
7. **프로세스 표**(:461→:454, 2초마다 통째): `changed()` + `keepFocus()`, 줄(:435)은 Enter·Space 둘 다.
8. **날짜**(:473 `toLocaleString()`): `fmtDT`.
9. **미터 임계값**(:93): `title`에만 있다 → `aria-label`에 `CPU 78%, 경고 70 · 위험 90` 꼴로도 넣는다. 화면 글은 늘리지 않는다.
10. 상세 화면 제목: `setTitle('<서버> · 서버')`.

## 로그 수집 (`#collect`)

11. **조용한 실패**(`collect.js:159` 적용, `:233` 삭제는 409만 알림): `toastError`. `일부만 적용됨 — …`(:119)은 2.5초 만에 사라진다 → `level:'error'`에 `action`으로 문제 칸 가는 링크.
12. **잠금**: 삭제·폴더 다시 읽기를 `act()`로. 삭제 확인(:228)은 `confirmBox({danger:true})`.
13. **첫 로드 실패**(:286 무방비 `await load()`): `stateBox('error', {e, retry})`.
14. **`이상만 보기`**를 `setQuery`로 유지.

## 수집 마법사 (`collectwiz.js`)

15. **바깥 누르기**(:407-408): 입력한 것이 있으면 `confirmBox`로 묻고 닫는다. Esc도 같은 길. `trapFocus`로 가두고 첫 입력 칸에 포커스.
16. **label 연결**(:440, :467): 글과 입력을 `for`/`id` 또는 감싸기로 잇는다.
17. **누를 수 있는 div·span**(:453, :506): `button`으로.

## 확인

- `check.sh 8813`(1440·390·dark·`W=2560 H=1200`).
- `SEARCH='?fail=/catalog'`로 `host/match-01/cpu`, `'?fail=/collect'`로 `collect`.
- `eval`: 머리 단추 클릭 뒤 `aria-sort`와 주소, 찾기 `match` 뒤 줄 수, 프로세스 줄 포커스가 3초 뒤 유지, 마법사에서 입력 뒤 Esc → 확인 창.
