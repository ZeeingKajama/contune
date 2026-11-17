// 막 8 · 믿고 쓴다. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 감사 기록(누가 · 언제 · 무엇을) → 역할(조회 계정의 잠긴 단추) → SQL 판 → 어두운 테마 → All-in-One 벽면 → 끝(밝은 테마로 되돌림).
import { flow, byText, toLight, showDark } from './util.js';

// 감사 기록의 분류 단추(전체 · 로그인 · 플로우 · 실행 조작 …)
const SEG = '.au-filters .bt-seg';
const runSeg = byText(SEG + ' button', '실행 조작');
const runOn = (doc) => { const b = runSeg(doc); return !!b && b.getAttribute('aria-pressed') === 'true'; };
// 로그인 실패 몰림 표시(같은 곳 5분 새 n회)가 붙은 줄이 있는 표(로그인으로 거르면 몰린 다섯 줄과 보통 로그인 몇 줄뿐이다)
const burstTbl = (doc) => { const b = doc.querySelector('.au-tbl .au-burst'); return b ? b.closest('table') : null; };
// 조회 계정에게 잠긴 '▶ 지금 실행'
const lockedRun = byText('#page button.primary.locked', '지금 실행');
// All-in-One 보드가 그려졌는가(업무 흐름 위젯의 상자)
const WALL = '.dw[data-id="flow"] .bf-box';

export default {
  id: 'trust',
  title: '믿고 쓴다',
  stops: [
    {
      id: 'audit', title: '감사 기록',
      say: '로그인 · 플로우 · 실행 조작 · 로그 수집 · 보드. 누가 · 언제 · 무엇을 했는지 남습니다.',
      point: '분류 단추의 실행 조작을 누릅니다',
      go: '#audit', exact: true, target: SEG,
      press: [
        { click: runSeg, unless: runOn },
        { wait: runOn },
      ],
    },
    {
      id: 'auditrun', title: '누가 · 언제',
      // 앞 막에서 조작을 안 하고 건너뛰어 와도 맞는 말: 씨앗 기록에 수동 실행 · 강제 OK(사유) · 강제 종료가 있다
      say: '실행을 사람이 바꾼 일입니다. 강제 종료 · 강제 OK는 ⚠가 붙고, 강제 OK는 사유까지 남습니다.',
      point: '앞에서 한 재실행 · 강제 종료 · 강제 OK는 맨 위 줄에',
      go: '#audit?kind=run', target: '.au-tbl',
    },
    {
      id: 'burst', title: '로그인 실패 몰림',
      say: '같은 곳에서 5분 새 5회. 로그인 실패가 몰리면 표시가 붙습니다.',
      point: '⚠ 로그인 실패 다섯 줄 · 사용자 칸은 들어온 주소',
      go: '#audit?kind=login', target: burstTbl,
    },
    {
      id: 'viewer', title: '조회 계정',
      say: '같은 화면, 잠긴 단추. 역할은 조회 · 운영 · 관리 셋입니다.',
      point: '위 막대 viewer · 조회 · 감사 기록 링크도 없습니다',
      as: 'viewer', go: flow('대외송수신', 'ext-send-margin'), target: lockedRun,
    },
    {
      id: 'sql', title: 'SQL로 꺼낸다',
      say: '쌓인 데이터는 우리 DB에. 표준 SQL로 꺼내 통계 · 학습에 씁니다.',
      point: 'book_insert 5 → 78 · 위험 지수 장애 구간 안 94.8, 밖 0.2',
      dwell: 12000,
      slide: {
        kind: 'sql', title: 'SQL로 꺼낸다',
        lead: '공개 스키마 · 분석용 뷰 v_samples · v_profiles · 읽기 전용 eum sql',
        // 실제 명령 그대로: eum sql은 셸에서 한 번 실행하는 읽기 전용 명령이다(cmd/eum/main.go). 엔진이 cmd 앞에 '$ '를 그린다.
        blocks: [
          {
            label: '체결이 밀린 구간(p99 50ms 초과)과 평시에 체결 서비스가 CPU를 쓴 함수 비중(%)',
            cmd: 'eum sql --data /data "$(cat deploy/queries/slow-functions.sql)"',
            out: [
              'leaf          │ normal_pct │ slow_pct',
              '──────────────┼────────────┼─────────',
              'book_insert   │          5 │       78',
              'check_risk    │       44.1 │     12.3',
              'price_cross   │         29 │      7.7',
              '[unknown]     │       12.8 │      0.7',
              'expire_orders │        4.7 │      0.5',
            ].join('\n'),
          },
          {
            label: '위험 지수 1분 평균을 장애 구간 안 · 밖으로',
            cmd: 'eum sql --data /data "$(cat deploy/queries/risk-vs-incidents.sql)"',
            out: [
              'period       │ minutes │ avg_index │ max_index',
              '─────────────┼─────────┼───────────┼──────────',
              '장애 구간 안 │       5 │      94.8 │      99.2',
              '장애 구간 밖 │     134 │       0.2 │      13.6',
            ].join('\n'),
          },
        ],
        foot: '11-12 리허설 데이터(실제 서버 7대 + 모의 39대, 합성 부하)에서 뽑은 결과 · 질의는 deploy/queries/',
      },
    },
    {
      id: 'dark', title: '어두운 테마',
      say: '상황실은 어둡게.',
      // 관제 화면에서 바꾼다(범위를 푼 채로): 카드 · 서버 맵 · 차트가 함께 어두워지는 것이 보인다
      go: '#dashboard', exact: true, scene: [{ wait: '.dash-main .cards' }, showDark], target: '#theme',
    },
    {
      id: 'allinone', title: 'All-in-One으로!',
      say: '서버 · 배치 · 업무 · 위험도. 한 장으로.',
      hand: 'h를 누르면 가이드가 숨고 벽면만 남습니다(다시 h)',
      // 벽면 전체가 볼 것이라 테두리를 치지 않는다(target 없음). 위젯이 그려진 뒤에 차려진 것으로 본다
      go: '#dash/allinone?tv=1', scene: [{ wait: WALL }, showDark, { wait: WALL }],
      dwell: 12000,
    },
    {
      id: 'end', title: '끝',
      say: '실행 번호 하나가 배치 · 서버 · 업무 · 함수 추적을 잇습니다. 고맙습니다.',
      // 한 번뿐인 조작(재실행 · 강제 OK · 강제 종료 · 이상 없음)은 →로 이어 돌면 된 채로 남는다: 다음 손님 앞에서는 r
      hand: '다음 손님에게 처음부터 보이려면 r(처음 상태로). →는 조작이 남은 채 표지로 간다',
      go: '#dashboard', scene: [toLight],
      slide: { kind: 'end', title: '띄우고 · 지켜보고 · 돌아보고 · 고친다', lead: '실행 번호 하나로, 한 화면에서' },
    },
  ],
};
