# A. 공통 기반 (opus)

가지 `ui/a-foundation`, 워크트리 `.claude/worktrees/ui-a`, 포트 8810. 먼저 `README.md`를 읽는다.
B 묶음 9개가 이 계약에 기대어 동시에 일한다. **아래 이름·인자는 그대로 지킨다.** 기존 호출은 깨지지 않아야 한다(뒤 호환).

고치는 파일: `ui.js`, `api.js`, `app.js`, `index.html`, `style.css`, `mock/index.js`, 새 파일 `quickjump.js`·`css/quickjump.css`·`css/shell.css`·`css/risk.css`.
화면 파일(`pages/*`, `widgets/*`)은 고치지 않는다. 화면이 새 부품으로 옮겨 가는 일은 B가 한다.

## 1. api.js

| 계약 | 동작 |
|---|---|
| `api()` | 응답이 5xx면 `setHealth(false)`(지금은 `r.ok` 전에 true로 침, :66). 4xx는 그대로 true |
| `poll(fn, ms, opts)` | `opts.onError(e)`가 있으면 실패 때 부른다. 실패(상태 0 또는 5xx)가 2번 이어지면 그 poll을 '끊김'으로 센다. 성공하면 풀린다. 4xx는 끊김으로 안 센다 |
| `onPollState(fn)` → 해제 함수 | 듣는 쪽에 `{failing, lastOk, fails}`를 준다. `failing`은 살아 있는 poll(화면 범위+전역) 중 하나라도 끊김이면 true, `lastOk`는 끊긴 poll들의 마지막 성공 시각 중 가장 이른 것 |
| `pollState()` | 같은 값을 바로 돌려준다 |

`stopScope()`로 멈춘 poll은 집계에서 빠진다.

## 2. ui.js

| 계약 | 동작 |
|---|---|
| `errText(e)` | `ApiError`면 `e.error`(없으면 `오류 <status>`), 상태 0이면 `서버 응답 없음`, 아니면 `String(e.message ?? e)`. 화면 4곳의 사본(batch.js:134 등)과 같은 결과 |
| `errReason(e)` | 사람이 읽을 까닭: 0 `서버 응답 없음` · 401 `로그인이 끝남` · 403 `권한 없음` · 404 `없음` · 5xx `서버 오류(<status>)` · 그 밖 `errText(e)` |
| `toast(msg, opts)` | `opts`가 숫자면 예전처럼 ms. 객체면 `{level:'info'\|'ok'\|'error', ms, action:{text, href\|onclick}}`. `error`는 닫을 때까지 머문다(✕ 단추, `aria-label="닫기"`, `role=alert`). 한 번에 4개까지, 넘치면 오래된 info부터 지운다. 같은 글의 토스트가 떠 있으면 새로 쌓지 않는다 |
| `toastError(what, e)` | `toast(`${what} · ${errReason(e)}`, {level:'error'})` |
| `stateBox(kind, opts)` → 요소 | `kind`: `'loading'`(기본 글 `불러오는 중…`) · `'empty'`(기본 `없음`) · `'error'`(기본 `불러오지 못함`). `opts`: `{text, e, detail, retry, action:{text, href\|onclick}}`. `error`는 `e`가 있으면 `errReason(e)`를 까닭 줄로, `retry`가 있으면 `다시 시도` 단추, 원문(`errText`)은 `<details>`로 접는다. 클래스 `.state .state-<kind>`, error는 `role=alert` |
| `act(btn, fn, opts)` → `Promise<boolean>` | `btn`을 잠그고(`disabled`, `aria-busy`) `fn()`을 기다린다. 성공하면 `opts.ok` 글을 `level:'ok'` 토스트로, 실패하면 `toastError(opts.fail ?? '하지 못함', e)`. 끝나면 푼다. `btn`이 null이어도 된다. 같은 단추가 잠겨 있으면 바로 false |
| `confirmBox(opts)` | 반환값 그대로. 더하기: Esc=취소, 사유 칸에서 Enter=확인, 포커스 가두기, 닫으면 열기 전 포커스로 복귀, `aria-modal`·`aria-labelledby`. `opts.danger:true`면 확인 단추에 `.danger`, **첫 포커스는 취소** |
| `openDrawer(title)` | 반환값 그대로. 더하기: Esc로 닫힘, `role=dialog`·`aria-modal`·`aria-label`, ✕에 `aria-label="닫기"`, 열리면 서랍으로 포커스, 닫으면 복귀, 포커스 가두기(안의 내용이 주기마다 다시 그려져도 동작: Tab을 누를 때 그때의 포커스 대상을 센다) |
| `trapFocus(node, {onEscape})` → 해제 함수 | 손으로 만든 모달용. Tab 가두기 + Esc 콜백 + 해제 때 포커스 복귀 |
| `table(opts)` | `onRow`가 있으면 줄에 `tabindex=0`, Enter·Space로 `onRow`. 더하기 `opts.rowKey(row)` → 줄에 `data-fk`. `columns[].sort`는 다루지 않는다 |
| `changed(store, key, data)` → bool | `JSON.stringify(data)`가 `store[key]`와 같으면 false, 다르면 저장하고 true. 주기 갱신에서 "바뀔 때만 다시 그리기"에 쓴다 |
| `keepFocus(container, redraw)` | `redraw()`를 돌리고 포커스·스크롤을 되살린다. 포커스는 `closest('[data-fk]')`의 값 + 그 안에서 몇 번째 포커스 대상인지로 다시 찾는다. `container`의 `scrollTop`도 지킨다. 포커스가 `container` 밖이면 아무것도 안 한다 |
| `leaveGuard(isDirty, msg)` → 해제 함수 | `isDirty()`가 true인 동안 새로 고침·닫기(`beforeunload`)와 화면 안 링크 이동을 막고 `confirmBox`로 묻는다. `dashedit.js:1236-1253`의 방식을 그대로 옮긴다(dashedit.js 자체는 고치지 않는다) |
| `info(text)` | 반환 요소 그대로. 더하기: `role=tooltip`+`aria-describedby`, Esc로 닫힘, 누르면(터치) 열리고 닫힘, 오른쪽·아래로 넘치면 뒤집는다(화면별 덮어쓰기 5곳은 건드리지 않는다) |
| `iconBtn(symbol, label, attrs)` | 기호 단추. `aria-label`과 `title`에 `label` |
| `tabBar(items, active, onSelect)` | 인자 그대로. 더하기: 단추에 `role=tab`·`aria-selected`, ←→로 이동 |
| `fmtDT(ts, {sec})` | `MM-DD HH:MM`, `sec:true`면 `MM-DD HH:MM:SS`. 표·목록의 날짜는 이것 하나로 |
| `p2(n)` | 두 자리 채우기(이미 있는 것을 export) |
| `setTitle(text)` / `setTitleCount(n)` | `document.title` = `(n) text · 이음`(n이 0이면 괄호 없음, text가 없으면 `이음`) |
| `setQuery(patch)` | 지금 해시의 쿼리에 `patch`를 합쳐 `history.replaceState`로 바꾼다(값이 `''`·null이면 그 키를 뺀다). hashchange를 일으키지 않는다. 거르기·정렬을 주소에 남길 때 쓴다 |

`toast`는 39곳에서 `toast(글)`·`toast(글, ms)`로 부른다. 그대로 돌아야 한다.

## 3. app.js · index.html

1. **갱신 끊김 표시**: 시계 왼쪽에 `<span id="stale" hidden>`. `onPollState`로 끊기면 `갱신 끊김 HH:MM:SS~`(경고 색, `role=status`), `document.body.dataset.stale='1'`. 풀리면 숨기고 속성을 지운다. 기존 `#warnbar`(네트워크 오류)는 그대로 두되 `role=alert`.
2. **화면을 못 그렸을 때**(:58): `stateBox('error', {text:'화면을 그리지 못함', e, retry: route})`.
3. **제목**: `route()`에서 화면 이름으로 `setTitle`(관제·서버·배치·업무·보드·실행·알림·장애 위험도·감사 기록·로그 수집·종료 보고서 등). 상세 화면이 더 자세한 제목을 나중에 덮어써도 된다. 알림 종 poll에서 `setTitleCount(n)`.
4. **라이브 영역**: `#toasts`에 `role=status aria-live=polite`, 종에 `aria-label="알림 N건"`, 테마 단추에 `aria-label`.
5. **화면 이동 뒤 포커스**: `#page`에 `tabindex=-1`, 그린 뒤 `page.focus({preventScroll:true})`(윤곽선 없음).
6. **빠른 이동 자리**: 위 막대에 `<button id="qj-open" type="button">` (`찾기`, title `Ctrl+K`). `quickjump.js`는 `export function initQuickJump() {}` 빈 틀만 만들고 `start()`에서 부른다. 내용은 P9가 채운다.
7. **빈 CSS 파일**과 링크: `css/shell.css`(P1), `css/risk.css`(P2), `css/quickjump.css`(P9). 머리말 주석 한 줄만.

## 4. style.css

- 전역 `:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }`. 마우스 클릭에는 안 보여야 한다.
- 토큰만 정의(치환은 D): `--r-sm:4px; --r-md:6px; --r-lg:8px; --z-top:20; --z-tip:30; --z-drawer:40; --z-modal:50; --z-toast:60; --z-login:100; --fs-xs:11px; --fs-sm:12px; --fs-md:13px;`
- 새 규칙: `.state*`, 토스트 등급(`.toast.ok`·`.toast.error`·닫기 단추), `button.danger`, `#stale`, `.tbl tr.click:focus-visible`, `.tblwrap { overflow-x:auto; }`(좁은 화면에서 표를 감싸는 칸), `body[data-stale] .trlive`(흐리게).
- 고침: `.trange button.on`의 `#fff` → `var(--on-accent)`(:136).

## 5. mock/index.js — 실패 화면 확인용 깃발

- `?fail=<경로 접두사>[,…]`: 그 경로로 시작하는 요청에 500 `{error:'mock 실패'}`. 예 `?fail=/alerts`.
- `?slow=<ms>`: 모든 응답을 그만큼 늦춘다.
- 주소 쿼리와 해시 쿼리 둘 다에서 읽는다(`pageFlags`의 방식).

## 확인

1. `check.sh 8810`을 1440·390·dark로: 콘솔 오류 0, 화면이 지금과 같아 보일 것(새 부품은 아직 화면에서 안 쓴다).
2. `eval`로: 토스트 info/ok/error·4개 상한, `confirmBox`의 Esc·Enter·`danger` 첫 포커스, `openDrawer`의 Esc·포커스 복귀(배치판 줄을 눌러 여는 실행 서랍), `SEARCH='?fail=/hosts'`에서 `#stale`이 뜨고 풀리는지, `?fail=/catalog`으로 `#host/match-01/cpu`가 다시 시도 단추를 보이는지, 제목이 화면마다 바뀌는지.
3. 계약 표의 함수가 전부 export되는지 `eval`에서 `import('./ui.js')`로 이름을 세어 확인.
4. `go build ./... && go vet ./internal/manager/...`.

보고는 README 양식 + **계약에서 달라진 점**(이름·인자를 바꿨다면 한 줄씩). 달라진 점이 있으면 이 문서의 표도 같은 커밋에서 고친다.
