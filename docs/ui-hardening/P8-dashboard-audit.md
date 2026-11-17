# P8. 관제·감사·시간 막대 (sonnet)

가지 `ui/p8-dashboard`, 워크트리 `.claude/worktrees/ui-p8`, 포트 8818. 먼저 `README.md`, 그다음 `A-foundation.md`의 계약 표.
소유: `pages/dashboard.js`, `pages/audit.js`, `ai.js`, `auditfmt.js`, `timerange.js`, `chart.js`, `css/dashboard.css`, `css/ai.css`, `css/audit.css`, `mock/audit.js`.
`dashboard.js`의 `svcHash`·`ownerHash`·`serviceTitles`·`servicesOf`·`tileView`·`ALERT_MARK`, `chart.js`의 `lineChart`·`fmtTime`·`fmtTick`·`fmtSpan`·`unitScale`, `ai.js`의 `parseSpan`, `timerange.js`의 `createTimeRange`는 거의 모든 화면이 쓴다. **이름·인자·반환을 바꾸지 않는다.** `timerange.js`·`chart.js`는 아래 적힌 것만 고친다. AI 브리핑·원인 추적의 문장과 용어는 11-17에 정한 그대로 둔다.

## 관제 (`#dashboard`)

1. **첫 로드·실패**(:645): 필수 4개(`/hosts`·`/flows`·`/panels`·`/alerts`) 중 하나만 실패해도 계속 빈 화면이다 → 첫 로드 `stateBox('loading')`, 실패 `stateBox('error', {e, retry})`. 한 번 그린 뒤의 실패는 지난 화면을 두고 위 막대의 끊김 표시(A)에 맡긴다.
2. **누를 수 있는 span·div**(:428, :467, :484, :503 / 리스너 :451, :456, :506): `a`(주소가 있는 것) 또는 `button`으로. 모양은 그대로.
3. **a 안의 button**(:547-552, 실시간 이벤트의 `✦ 원인`): 겹치지 않게 줄을 `div`로 하고 링크와 단추를 나란히.
4. **`title`에만 있는 것**: 서버 맵 칸(:524), 업무 지표(:503) → `aria-label`에 `match-01 CPU 78% 경고` 꼴. 서버 맵 칸은 화살표 키로 옆 칸 이동은 하지 않고 Tab 순서만.
5. **시간대별 배치 막대**(:584): 조각은 색뿐이다. 막대의 `aria-label`은 이미 있으니 그대로 두고, 범례 글과 순서가 맞는지만 확인.
6. `durText`(:389)와 `ui.fmtDuration`이 `3분`·`3분 12초`로 갈린다 → 관제의 짧은 꼴은 남기되 함수 머리에 까닭 주석, 60초 미만은 같은 글이 나오게.

## 감사 기록 (`#audit`)

7. **실패가 `기록 없음`으로 보임**(:200): `stateBox('error', {e, retry})`. 첫 로드(:149)와 0건은 `stateBox('loading')`·`'empty'`.
8. 줄(:153) Enter·Space, `data-fk`. 주기 갱신에 `changed()`.
9. 날짜(`:28`의 `YYYY-MM-DD ….mmm`)는 감사 기록이라 그대로 둔다.

## 시간 막대 (`timerange.js`) — 구간 막대를 쓰는 모든 화면에 걸린다

10. **날짜 칸 2개**(:40)에 `aria-label`(`시작`·`끝`).
11. **`● 실시간`**(:47): `onPollState`를 들어 끊겼으면 `갱신 끊김`(경고 색, 점은 `○`)으로 바꾼다. 풀리면 되돌린다. 해제를 잊지 않는다(화면이 바뀌면 `dispose`).
12. 구간 단추에 `aria-pressed`.

## 차트 (`chart.js`)

13. 차트 칸에 `role=img`와 `aria-label`(`<제목>, 현재 <값><단위>` 정도, 계열이 여럿이면 첫 둘). 말풍선·범례 동작은 건드리지 않는다.

## AI 서랍 (`ai.js`)

14. 원인 추적 서랍이 A의 `openDrawer` 개선(Esc·포커스)을 그대로 받는지 확인. 서랍 안 3초 갱신(`:228` 부근)이 포커스를 날리면 `keepFocus`.

## 확인

- `check.sh 8818`(1440·390·dark)로 `dashboard`·`audit`, 그리고 시간 막대를 쓰는 `host/match-01/cpu`·`biz/matching`·`runs`가 예전처럼 뜨는지.
- `SEARCH='?fail=/hosts'`로 관제, `'?fail=/audit'`로 감사.
- `eval`: 관제에서 Tab으로 닿는 요소 수가 늘었는지, `✦ 원인` → 서랍 → Esc → 포커스 복귀, `?fail=/metrics`(차트 값 경로를 코드에서 확인) 뒤 `갱신 끊김` 글.
