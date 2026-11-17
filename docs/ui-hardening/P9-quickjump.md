# P9. 빠른 이동 (sonnet)

가지 `ui/p9-quickjump`, 워크트리 `.claude/worktrees/ui-p9`, 포트 8819. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `quickjump.js`, `css/quickjump.css` 둘뿐. A가 빈 틀(`export function initQuickJump() {}`)과 위 막대 단추 `#qj-open`, CSS 링크를 넣어 두었다. `app.js`·`index.html`은 고치지 않는다.

## 할 일

1. **열기**: `Ctrl+K`(맥은 `⌘K`), 입력 칸 밖에서 `/`, 위 막대 `#qj-open`. 로그인 화면(`body.logged-out`)에서는 안 열린다.
2. **모양**: 화면 가운데 위쪽의 작은 창. 입력 칸 하나 + 결과 목록. `role=dialog aria-modal`, `trapFocus`, Esc·바깥 누르기로 닫힘, 닫으면 포커스 복귀.
3. **찾는 것**(열 때 한 번 받아 30초 동안 다시 쓰고, 실패한 것은 빼고 보인다):
   - 화면: 관제·서버·배치·업무·서비스·보드·실행·종료 보고서·알림·장애 위험도·로그 수집·감사 기록(감사는 `can('admin')`일 때만)
   - 서버(`/hosts` → `#host/<id>/overview`), 플로우(`/flows` → `tree.js`의 주소 규칙 `#board/<배치판>/<id>`), 서비스(`/services` → `#svc/<id>?host=<서버>`, 인스턴스마다), 업무 패널(`/panels` → `#biz/<id>`), 보드(목록 API는 `pages/dash.js`에서 확인)
4. **맞추기**: 대소문자 무시 부분 일치. 이름 앞부분이 맞는 것 먼저, 같은 묶음 안에서는 상태가 나쁜 것 먼저. 결과는 종류별 꼬리표(`서버` `플로우`…)와 상태 배지(`ui.js`의 `badge`). 최대 30줄.
5. **입력이 비었을 때**: 최근 간 곳 5개(`localStorage` `eum.qj.recent`) + 지금 이상이 있는 서버·실패한 플로우.
6. **키**: ↑↓ 고르기(끝에서 돌아감), Enter 이동, Esc 닫기. `role=listbox`/`option`, `aria-activedescendant`.
7. **좁은 화면**: 390px에서 창이 화면 폭에 맞고 목록이 화면 높이를 넘지 않는다.
8. ⓘ나 안내 문장은 넣지 않는다. 입력 칸 자리 글자 `서버·플로우·서비스·화면` 하나면 된다.

## 확인

- 작업 JSON을 만들어 `check.sh 8819 <내 작업.json>`(1440·390·dark): `eval`로 `Ctrl+K` keydown을 보내 창이 뜬 스크린샷.
- `eval`: `match` 입력 뒤 결과 수와 첫 줄, ↓↓ Enter 뒤 `location.hash`, Esc 뒤 창이 사라지고 포커스가 돌아왔는지, 다시 열었을 때 최근 간 곳.
- `SEARCH='?fail=/services'`에서도 나머지 결과가 뜨는지.
- 전체 `check.sh 8819`로 다른 화면 콘솔 오류 0.
