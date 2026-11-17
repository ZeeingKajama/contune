# P4. 실행·종료·타임머신 (sonnet)

가지 `ui/p4-runs`, 워크트리 `.claude/worktrees/ui-p4`, 포트 8814. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `pages/runs.js`, `pages/exits.js`, `pages/tm.js`, `pages/exit.js`, `pages/devflame.js`, `flame.js`, `lineage.js`, `css/runs.css`, `css/tm.css`, `css/exit.css`, `css/flame.css`, `mock/exit.js`.
`svc.js`(P5)가 `tm.js`의 `fixedAB`·`topChanges`, `runs.js`의 `procChips`, `exit.js`의 `exitStrip`·`endText`, `flame.js`·`lineage.js`의 export를 쓴다. **이름·인자·반환을 바꾸지 않는다.** `rn-`·`tm-` 규칙은 감사·종료·서비스 화면도 쓴다. 뜻을 바꾸지 않는다.

## 실행 이력 (`#runs`)

1. **갱신**(:351, 5초마다 1000줄×9칸을 통째로): `changed()`로 바뀔 때만, `keepFocus()`로 포커스 유지(스크롤은 :310-312에서 이미 지킨다).
2. **실패와 빈 것 구분**(:350 `load().catch(()=>{})`): 첫 로드 `stateBox('loading')`, 실패 `stateBox('error', {e, retry})`, 0건은 지금 문구.
3. **줄**(:290): Enter만 된다 → Space도, 줄에 `data-fk`(실행 ID).
4. **시간대 막대**(:243, :246): 조각이 색뿐이고 마우스로만 고른다 → 막대를 `button`으로, `aria-label="15:30~16:00 성공 12 · 실패 2"`. 고른 시간대(`win`)를 `setQuery`로 유지.
5. **1200px 이하**: 실행 ID·실행 유형 열을 숨겨 플로우 › 스텝 칸이 `intra…`로 잘리지 않게. 700px 이하는 `.tblwrap`.
6. 날짜는 `fmtDT`. 화면 안에 `11-17`과 `11/17(화)`가 섞이지 않게 표는 `fmtDT`, 구간 문구는 그대로.

## 종료 보고서 목록 (`#exits`)

7. 1·2·3과 같은 처리(:130 갱신, :90 줄).

## 실행 타임머신 (`#run/<id>`)

8. **오류 구분**(:149-150): 모든 오류가 `실행을 찾을 수 없음`이다 → 404만 그 문구 + 실행 이력 링크, 그 밖은 `stateBox('error', {e, retry})`. `svc.js:213`·`exit.js:276`의 방식 참고.
9. **주소에 상태**(:145가 query를 안 받는다): A·B 구간과 아래 탭을 주소에 남기고 읽는다. 열쇠는 서비스 타임머신과 같게 `a=<from>-<to>`, `b=…`, `tab=`. `setQuery` 사용.
10. **누를 수 있는 div·span**(:207, :366): `button`·`a`로.
11. 제목 `setTitle('<플로우> › <스텝> · 실행')`.

## 종료 보고서 (`#exit/<id>`)

12. :390의 누를 수 있는 요소를 `button`으로. `fmtWhen`(:175) → `fmtDT`. 제목 `setTitle`.
13. `flame.js:137` 프레임 칸: 키보드로 고를 수 있게(`tabindex`, Enter), `aria-label`에 함수 이름·비율. 색(`flame.js:5, 121`, `flame.css:6, 9`)은 그대로 둔다.

## 확인

- `check.sh 8814`(1440·`W=1024`·390·dark).
- `SEARCH='?fail=/runs'`·`'?fail=/exits'` 실패 화면. 타임머신은 없는 ID(`#run/NOPE`)와 `?fail=/runs`를 각각.
- `eval`: 줄 포커스 6초 뒤 유지, 시간대 막대 Enter → 주소의 `win`, 타임머신에서 A 구간 고른 뒤 주소 → 새로 고침해도 같은 구간.
- `#svc/matching?host=match-01`이 예전처럼 뜨는지(P5 화면이지만 이 묶음의 export를 쓴다).
