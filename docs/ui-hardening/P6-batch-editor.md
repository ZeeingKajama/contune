# P6. 배치·플로우 편집기 (sonnet)

가지 `ui/p6-batch`, 워크트리 `.claude/worktrees/ui-p6`, 포트 8816. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `pages/batch.js`, `pages/editor.js`, `flowgraph.js`, `css/batch.css`, `css/editor.css`, `mock/editor.js`, `mock/ops.js`.
`batch.js`의 `TRIGGER_TEXT`·`hashOfBoard`·`hashOfFlow`는 다른 화면이 쓴다. 이름·인자를 바꾸지 않는다.
편집기 캔버스(끌기·연결·확대)의 동작은 바꾸지 않는다. 캔버스 코드를 크게 고쳐야 풀리는 항목은 하지 말고 보고한다.

## 배치판·플로우 (`#board/…`)

1. **변경 동작**(:135 `act`, 쓰는 곳 :307 지금 실행 · :316 삭제 · :598 서랍의 강제 OK·재실행·강제 종료): 화면 안 `act`·`errText`(:134)를 지우고 `ui.js`의 `act(btn, fn, {ok, fail})`·`errText`로. 진행 중 단추가 잠겨야 한다. 실패는 머무는 토스트로.
2. **삭제·강제 종료 확인**(:315 등): `confirmBox({danger:true})`.
3. **실행 서랍**(:588→:609, 2초마다 단추를 새로 만든다): `changed()`로 바뀔 때만, `keepFocus()`.
4. **플로우 상세**(:641 갱신, :570 탭을 통째로 다시 그림): `changed()` + `keepFocus()`.
5. **정의·변경 이력 탭**(:534-553): 오류가 `S.defErr`에 남아 다시 요청하지 않는다 → `stateBox('error', {e, retry})`.
6. **첫 로드·실패**(:257, :641이 삼킴): `stateBox`.
7. **최근 10회 띠**(:161-170): 색뿐이고 `title`뿐이다 → 실패 칸에 `✕` 모양(작은 글자나 무늬), 띠 전체에 `aria-label="최근 10회: 성공 9 · 실패 1"`.
8. **단추가 잠긴 까닭**(:601): `title`에만 있다 → 단추 줄 아래 작은 글 한 줄로도 보인다.
9. 줄(`ui.table`의 `onRow`, :252·:472)에 `rowKey`를 줘 포커스가 유지되게. 날짜는 `fmtDT`(:12, :18의 사본 제거).
10. 제목 `setTitle('<플로우> · 배치')`.

## 플로우 편집기 (`#edit/<플로우>`)

11. **미저장 보호**(:257): `돌아가기` 단추에서만 묻는다 → `leaveGuard(() => 바뀜 여부)`로 메뉴 이동·새로 고침도 막는다. 저장하면 풀린다.
12. **`field()`**(:566, 14칸): label이 입력과 안 이어져 있다 → `for`/`id`.
13. **노드 고르기**(:442): `tabindex`는 있는데 키가 없다 → Enter·Space로 고르기(속성 칸이 열림). 화살표 이동은 하지 않는다.
14. **오류 표시**(:445): `!`+`title`뿐 → 오른쪽 속성 칸 위에 문제 글을 보인다(`role=alert`).
15. **누를 수 있는 요소**(:774): `button`으로(`dashedit.js:1170`이 같은 부품을 제대로 만든 예).
16. **AI 초안 모달**(:869): `trapFocus`, 닫으면 포커스 복귀.
17. **Ctrl+S**: 저장 단추와 같은 동작. 입력 칸 안에서도.
18. `errText`(:214) 사본 제거.

## 확인

- `check.sh 8816`(1440·390·dark)로 `board/`·`board/개장준비`·플로우 상세·`edit/market-open`.
- `SEARCH='?fail=/flows'` 실패 화면.
- `eval`: 배치판 줄 → 서랍 → 단추 포커스가 3초 뒤 유지, 편집기에서 스텝 이름을 바꾼 뒤 `location.hash='#dashboard'` → 확인 창이 뜨고 취소하면 편집기에 남는지, Ctrl+S 뒤 가드가 풀리는지.
