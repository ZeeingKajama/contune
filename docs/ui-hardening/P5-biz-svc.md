# P5. 업무·서비스 (sonnet)

가지 `ui/p5-biz`, 워크트리 `.claude/worktrees/ui-p5`, 포트 8815. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `pages/biz.js`, `pages/svc.js`, `pages/panelbands.js`, `css/biz.css`, `css/svc.css`, `mock/biz.js`, `mock/services.js`.
`biz.js`의 `bizTabs`·`splitPrefix`, `panelbands.js`의 export는 다른 화면이 쓴다. 이름·인자를 바꾸지 않는다. `tm-`·`rn-` 규칙(P4 소유 파일)은 고치지 않는다.

## 업무 패널 (`#biz`, `#biz/<패널>`)

1. **오류가 `—` 한 글자**(:198, :206): `stateBox('error', {e, retry})`. 첫 로드는 `stateBox('loading')`.
2. **조용한 실패**: 패널 다시 읽기(:202, 주석은 "알림은 api가 한다"지만 403만 알린다), 알림 확인(:592, try 없음), CSV(:552, try 없음) → `act()`·`toastError`.
3. **로그 0건**: 지금 문구 없는 큰 흰 상자다 → `stateBox('empty', {text:'이 구간 로그 없음'})`, 높이도 줄인다.
4. **값이 계속 0인 차트**: 0~1 축으로 큰 자리를 차지한다(`채널` 패널의 `대기`) → 구간 내내 0이면 차트 높이를 절반으로 하고 축 위 끝을 임계값(없으면 1)으로.
5. **차트가 홀수 개**: 마지막 칸이 비어 보인다 → 마지막 하나는 두 칸 폭.
6. **주소에 상태**(:367-370): 로그 레벨·찾기·보기(목록/패턴)를 `setQuery`로.
7. **좁은 화면**: 패널 탭이 한 자씩 꺾인다 → 탭 줄 `nowrap` + 가로 스크롤. 핵심 지표 카드 제목이 `R··`로 잘리는 것은 두 칸 격자로.
8. **키보드**: `tabindex`만 있고 키 처리가 없는 곳(:484), Enter만 되는 줄(:457) → Enter·Space.
9. **갱신**(:305, :600): `changed()`로 바뀔 때만. 로그 표에서 포커스·스크롤 유지.
10. 로그 줄의 등급이 왼쪽 색 띠뿐인지 확인하고, 그렇다면 레벨 글자 칸이 좁은 화면에서도 남게 한다.

## 서비스 (`#svcs`, `#svc/<id>`)

11. **조용한 실패**(`svc.js:139`): `toastError`.
12. **목록 갱신**(:193→:190, 5초 통째): `changed()` + `keepFocus()`, 줄(:155) Enter·Space.
13. **누를 수 있는 요소**(:416): `button`.
14. 제목 `setTitle('<서비스> · 서비스')`.

## 확인

- `check.sh 8815`(1440·390·dark)로 `biz`·`biz/matching`·`svcs`·`svc/…`.
- `SEARCH='?fail=/panels'`·`'?fail=/services'` 실패 화면.
- `eval`: `#biz`(채널)에서 로그 빈 문구, 로그 레벨 `오류` 고른 뒤 주소, 서비스 목록 줄 포커스 6초 뒤 유지.
