# P7. 보드·위젯 (sonnet)

가지 `ui/p7-boards`, 워크트리 `.claude/worktrees/ui-p7`, 포트 8817. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `pages/dash.js`, `pages/dashedit.js`, `widgets/*.js`, `css/dash.css`, `css/dwidgets.css`, `css/widgets.css`, `css/dashedit.css`, `css/flow.css`, `mock/dash.js`.
`widgets/metric.js`의 `limitsOf` 등 다른 화면이 쓰는 export는 이름·인자를 바꾸지 않는다. 관제 화면(`dashboard.js`, P8)의 카드는 `dcard` 규칙을 같이 쓴다. `css/dwidgets.css`의 `dcard` 뜻은 바꾸지 않는다.

## 보드 보기 (`#dash/<id>`)

1. **위젯 안이 잘림**: `서버별 CPU`는 마지막 줄이 반쯤 잘리고 `서비스 자원` 표는 스크롤 표시 없이 끊긴다.
   - 막대·목록 위젯: 들어가는 줄 수만 그리고 아래에 `외 N`.
   - 표·로그 위젯: 안에서 스크롤, 아래 끝에 흐림(그림자)으로 더 있음을 보인다. 벽면에서는 스크롤할 수 없으니 `외 N`.
2. **표 위젯 단위**(`widgets/metric.js:330` 부근): 열 최댓값 단위(GB)를 따라가 56.7MB가 `0.06`, 작은 값은 `0.00`이 된다 → 값마다 맞는 단위로 쓰고 단위를 값 옆에 작게(머리의 단위는 뺀다). 정렬 기준은 원래 값.
3. **실패 때 지난 값 유지**(`dash.js:245, 253`): 일부러 그렇게 하지만 표시가 없다 → 위젯 머리에 흐린 `HH:MM 값`(마지막 성공 시각)과 ⓘ. 전체 끊김은 위 막대가 알리니(A) 위젯 하나만 실패했을 때 쓴다.
4. **위젯 고르기 키보드**(`dash.js:284`): 클릭뿐 → Enter·Space, 포커스 가능.
5. **보드 고르기 칸 옆 `⚠ 1`**: 무엇이 1인지 `aria-label`.

## 벽면 (`?tv=1`)

6. **글자 크기**(`css/dash.css:76-86`): 1920×1080에서 본문이 15~16px이라 멀리서 작다 → 창 폭에 따라 커지게(`clamp`와 `vw`): 본문 18px 이상, 큰 숫자 44px 이상, 머리 20px 이상. 2560·3840에서도 비례.
7. 벽면에서는 1의 `외 N` 방식만 쓰고 잘린 줄이 없어야 한다.

## 보드 편집 (`#dashedit/<id>`)

8. **윤곽선을 지운 곳**(`css/dashedit.css:116, 147`): 전역 `:focus-visible`이 보이게 지운 줄을 걷어 낸다.
9. **모달**: 지표 고르기(`dashedit.js:884`), + 위젯 메뉴(:917), AI 초안(:1096)을 `trapFocus`로 통일(닫으면 포커스 복귀). 라벨 없는 입력 3칸(:429-433)에 `aria-label`.
10. **미저장 보호**(:1236-1253): `ui.js`의 `leaveGuard`로 바꾼다(동작은 같아야 한다).
11. **삭제 확인**(:1217): `confirmBox({danger:true})`. `errText`(:318) 사본 제거.
12. `mock/dash.js:243` 라벨 `CPU %`·`RSS MB` → `CPU`·`메모리`(실제 보드 `dashboards/trading.yaml`과 같게. 단위가 두 번 나온다).

## 확인

- `check.sh 8817`(1440·390·dark)로 `dashes`·`dashedit/trading`, 벽면은 `W=1920 H=1080`·`W=3840 H=2160` 어두운 테마.
- `SEARCH='?fail=/query'`(위젯 값 요청 경로를 코드에서 확인해 맞는 접두사로) 위젯 하나 실패 표시.
- `eval`: 벽면에서 `getComputedStyle`로 본문 글자 크기, 표 위젯 칸 글(`56.7MB` 꼴), 편집 화면에서 바꾼 뒤 이동 → 확인 창.
