# UI 고도화 지시서 (2026-11-17)

이음 웹 UI(`internal/manager/web/static`, 프레임워크 없는 바닐라 JS)의 실패 표시·키보드·좁은 화면·탐색을 다듬는다.
묶음마다 지시서 하나, 워크트리 하나, 가지 하나. 묶음끼리 **고치는 파일이 겹치지 않는다**.

## 단계와 모델

| 단계 | 묶음 | 지시서 | 모델 | 가지 | 워크트리(`.claude/worktrees/`) | 포트 |
|---|---|---|---|---|---|---|
| A | 공통 기반(계약) | `A-foundation.md` | **opus** | `ui/a-foundation` | `ui-a` | 8810 |
| B | P1 위 막대·트리 | `P1-shell.md` | sonnet | `ui/p1-shell` | `ui-p1` | 8811 |
| B | P2 알림·위험도 | `P2-alerts-risk.md` | sonnet | `ui/p2-alerts` | `ui-p2` | 8812 |
| B | P3 서버·로그 수집 | `P3-server-collect.md` | sonnet | `ui/p3-server` | `ui-p3` | 8813 |
| B | P4 실행·종료·타임머신 | `P4-runs.md` | sonnet | `ui/p4-runs` | `ui-p4` | 8814 |
| B | P5 업무·서비스 | `P5-biz-svc.md` | sonnet | `ui/p5-biz` | `ui-p5` | 8815 |
| B | P6 배치·플로우 편집기 | `P6-batch-editor.md` | sonnet | `ui/p6-batch` | `ui-p6` | 8816 |
| B | P7 보드·위젯 | `P7-boards.md` | sonnet | `ui/p7-boards` | `ui-p7` | 8817 |
| B | P8 관제·감사·시간 막대 | `P8-dashboard-audit.md` | sonnet | `ui/p8-dashboard` | `ui-p8` | 8818 |
| B | P9 빠른 이동 | `P9-quickjump.md` | sonnet | `ui/p9-quickjump` | `ui-p9` | 8819 |
| C | 통합·검증 | `C-integrate.md` | **opus**(판단이 갈리면 fable) | `ui/integ` | `ui-integ` | 8809 |
| D | 부품·토큰 정리 | `D-cleanup.md` | **opus** | `ui/d-cleanup` | `ui-d` | 8820 |

순서: **A → (P1~P9 동시에) → C → D**. B는 A가 `ui/integ`에 합쳐진 뒤에 갈라진다. D는 C가 끝난 뒤.
상위 모델이 필요한 까닭: A는 다른 묶음이 쓰는 함수 계약을 정하고, C·D는 여러 화면의 회귀를 눈으로 가려야 한다.

## 워크트리 규칙

- 통합 가지는 `ui/integ`(main 521530c에서 갈라짐). 본 폴더(`/home/han/work/contune`)와 `main`은 **건드리지 않는다**. push도 하지 않는다.
- 만들기(오케스트레이터가 한다):
  `git -C /home/han/work/contune worktree add .claude/worktrees/ui-pN -b ui/pN-이름 ui/integ`
- 묶음 세션은 **자기 워크트리 폴더 안에서만** 읽고 쓴다. 명령은 그 폴더에서 돌리거나 `git -C <폴더>`.
- 커밋 직전에 `git branch --show-current`가 자기 가지인지 확인한다. 아니면 멈추고 보고한다.
- `git stash`, `git checkout <다른 가지>`, `git worktree remove`, `git branch -d`는 쓰지 않는다. 정리는 오케스트레이터가 한다.
- `.claude/worktrees/judge-demo`와 `judge-demo`·`argon` 가지는 다른 세션 것이다.
- 다른 세션에서 사람이 직접 띄울 때: `cd .claude/worktrees/ui-pN && claude --model sonnet` → "docs/ui-hardening/README.md와 PN 지시서대로 진행".

## 파일 소유 (B 단계)

화면 파일은 `internal/manager/web/static/` 아래. 표에 없는 파일은 **아무도 고치지 않는다**.

| 묶음 | 고쳐도 되는 파일 |
|---|---|
| P1 | `index.html`, `app.js`, `tree.js`, `grouporder.js`, `style.css`(#top·#menu·#tree·#layout 규칙만), `css/shell.css` |
| P2 | `pages/alerts.js`, `pages/risk.js`, `riskfmt.js`, `css/alert.css`, `css/risk.css`, `mock/alert.js`, `mock/riskhold.js` |
| P3 | `pages/server.js`, `pages/collect.js`, `pages/collectwiz.js`, `css/server.css`, `css/collect.css`, `mock/server.js`, `mock/collect.js`, `mock/procs.js` |
| P4 | `pages/runs.js`, `pages/exits.js`, `pages/tm.js`, `pages/exit.js`, `pages/devflame.js`, `flame.js`, `lineage.js`, `css/runs.css`, `css/tm.css`, `css/exit.css`, `css/flame.css`, `mock/exit.js` |
| P5 | `pages/biz.js`, `pages/svc.js`, `pages/panelbands.js`, `css/biz.css`, `css/svc.css`, `mock/biz.js`, `mock/services.js` |
| P6 | `pages/batch.js`, `pages/editor.js`, `flowgraph.js`, `css/batch.css`, `css/editor.css`, `mock/editor.js`, `mock/ops.js` |
| P7 | `pages/dash.js`, `pages/dashedit.js`, `widgets/*.js`, `css/dash.css`, `css/dwidgets.css`, `css/widgets.css`, `css/dashedit.css`, `css/flow.css`, `mock/dash.js` |
| P8 | `pages/dashboard.js`, `pages/audit.js`, `ai.js`, `auditfmt.js`, `timerange.js`, `chart.js`, `css/dashboard.css`, `css/ai.css`, `css/audit.css`, `mock/audit.js` |
| P9 | `quickjump.js`, `css/quickjump.css` |

- 공통 파일(`ui.js`, `api.js`, `auth.js`, `mock/index.js`·`core.js`·`world.js`·`util.js`·`signal.js`·`catalog.js`, 표에 없는 `style.css` 규칙)은 B에서 **잠겨 있다**. 필요하면 고치지 말고 보고서의 `공통 요청`에 적는다(C에서 처리).
- 다른 화면이 import하는 함수는 **이름·인자를 바꾸지 않는다**(더하기만). 예: `tm.js`의 `fixedAB`, `runs.js`의 `procChips`, `dashboard.js`의 `svcHash`.
- CSS는 자기 파일에 자기 접두사로 더한다. 남의 파일에 있는 규칙(`rn-`을 감사·종료가 같이 씀 등)은 뜻을 바꾸지 않는다.
- Go 코드는 고치지 않는다. 서버 API가 모자라면 `공통 요청`에 적는다.

## 공통 규칙

- A가 만든 공통 부품을 쓴다(`A-foundation.md`의 계약 표). 같은 구실을 화면에서 다시 만들지 않는다.
- 화면 글은 현장 말로 짧게. 안내 문장을 늘어놓지 않고 뜻 설명은 ⓘ(`info()`) 안에. 한 단어는 한 뜻.
  쓰는 말: 대기 큐·히스토리 버퍼·로그 수집·로그 파일·버전·적용 대상. '갱신 끊김'(화면이 못 받아 옴)과 '값 끊김'(에이전트가 안 보냄)을 섞지 않는다.
- 실패·건너뜀은 **까닭 + 누가 뭘 하면 풀리는지 + 고치는 단추**. 원문 오류는 접어 둔다.
- 색은 `style.css`의 변수만. 새 색을 박아 넣지 않는다. 상태는 색 + 글자·기호로 같이.
- 주석·커밋 메시지는 한국어, 기존 파일의 말투를 따른다. 지시서에 없는 리팩터링·기능은 하지 않는다.
- 지시서의 `파일:줄`은 main 521530c 기준이다. A가 합쳐진 뒤 조금 밀릴 수 있다.

## 확인

워크트리 뿌리에서:

```sh
sh docs/ui-hardening/tools/check.sh <포트>                      # 전 화면 1440 밝은 테마, 콘솔 오류 0이어야 함
W=390 H=1100 sh docs/ui-hardening/tools/check.sh <포트>         # 좁은 화면
THEME=dark sh docs/ui-hardening/tools/check.sh <포트>           # 어두운 테마
SEARCH='?fail=/alerts' sh docs/ui-hardening/tools/check.sh <포트> <내 작업.json>   # 실패 화면(A가 만든 mock 깃발)
go build ./... && go vet ./internal/manager/...                 # 정적 파일은 go:embed
```

- 스크린샷은 `.run/shots/`(git에 안 들어감). 자기 화면은 **직접 열어 눈으로 본다**. 클릭·포커스는 작업 JSON의 `eval`로 확인한다(`tools/cdp.mjs` 머리말).
- 포트는 표의 자기 번호만 쓴다(chrome은 포트+1000). `pkill`은 쓰지 않는다.
- 자기 묶음과 상관없는 화면이 깨져 있으면 고치지 말고 보고한다.

## 끝낼 때

1. 자기 가지에 커밋(여러 개여도 됨). 메시지 첫 줄 `UI 고도화 PN: <한 일>`, 끝에 `Co-Authored-By` 줄.
2. **보고는 12줄 이내**, 아래 양식만. 과정 설명·코드 인용은 넣지 않는다.

```
가지·커밋: ui/pN-… <짧은 해시>
한 것: 항목 번호만 (예: 1 2 3 5)
안 한 것: 번호 + 까닭 한 줄씩
확인: check 1440/390/dark 콘솔 오류 수, go build 결과
공통 요청: 파일·함수·바라는 동작 한 줄씩 (없으면 없음)
알아 둘 것: 다음 사람이 모르면 사고 날 것만 (없으면 없음)
```

## A가 끝난 뒤 알아 둘 것 (B 묶음 공통)

- `route()`가 화면을 옮길 때마다 제목을 기본값으로 되돌린다. 자세한 제목(`setTitle`)은 `render`뿐 아니라 `reroute`에서도 다시 넣는다.
- 화면을 그리다 난 `ApiError`는 콘솔에 안 찍히고 실패 칸으로만 보인다. `check.sh`가 `OK`여도 자기 화면 스크린샷은 꼭 본다.
- 포커스 확인(`eval`의 `document.activeElement`)은 `tools/cdp.mjs`가 포커스 에뮬레이션을 켜 두어 headless에서도 맞게 나온다.
- 계약의 덧붙임 세 가지(`pollState`의 `fails`·`lastOk`, `toast`의 반환값, `stateBox`의 `detail`)는 `A-foundation.md` 표에 있다.
