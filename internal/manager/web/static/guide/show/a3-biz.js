// 막 3 · 업무 관제. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 줄기: 업무 흐름 보드 → 벽면(붉은 상자를 누름) → 매매체결 패널(핵심 지표 · 추이 · 로그 패턴) → 정보 벤더 시세(줄어드는 장애) → 로그 수집 → 숫자 뽑기.
// 로그 수집 마법사는 저장하지 않는다(다시 열면 처음 상태라 되풀이해도 같다).
import { enc, button } from './util.js';

const BOARD = '#dash/bizflow';
const PANEL = '#biz/matching';
const COLLECT = '#collect?s=' + enc('group:정보분배');

// 업무 흐름 위젯과 매매체결 상자
const FLOW = '.dw[data-id="flow"]';
const RED = FLOW + ' .bf-box[data-go="#biz/matching"]';
const onWall = (doc) => doc.body.dataset.tv === '1';

// 업무 패널의 로그 칸: 목록 | 패턴, 패턴으로 좁힌 표시, 펼친 줄
const LOGS = 'section.bz-logs';
const viewBtn = (text) => button(LOGS + ' .bz-lh .seg button', text);
const PAT = LOGS + ' table.bz-pat';
const PF = LOGS + ' .bz-pf';
const DET = LOGS + ' table.bz-log tr.det';
const none = (sel) => (doc) => !doc.querySelector(sel);

// 로그 수집: 로그 파일 표의 quote 줄과 그 편집 단추
const FILES = '.cl-main section.cl-sec';
const quoteEdit = (doc) => {
  const sec = doc.querySelector(FILES);
  const row = sec && [...sec.querySelectorAll('table.tbl tbody tr')].find((r) => /quote/.test((r.cells[0] || {}).textContent || ''));
  return row ? button('button', '편집')(row) : null;
};
// 마법사의 숫자 뽑기 탭(지표 칸이 보인다)
const WIZ = '.cw-modal';
const METRICS = WIZ + ' .cw-metrics';
const THIRD = METRICS + ' .cw-metric:nth-child(3)';
const lostLine = (doc) => [...doc.querySelectorAll(WIZ + ' .cw-lines .cw-line')].find((l) => /lost=[1-9]/.test(l.textContent)) || null;
const lastNum = (doc) => [...doc.querySelectorAll(WIZ + ' .cw-nums .cw-chip.num')].pop() || null;

export default {
  id: 'biz',
  title: '업무 관제',
  stops: [
    {
      id: 'bizflow', title: '업무 흐름',
      say: '채널 → 매매체결 → 시세 → 지수산출 → 분배. 막힌 업무만 붉습니다.',
      point: '매매체결 ■ 위험 3 · 분배 ▲ 경고',
      hand: '상자에 마우스를 올리면 이어진 화살표만 진해진다',
      go: BOARD,
      target: FLOW,
    },
    {
      id: 'tv', title: '벽면',
      say: '상황실 벽면용으로 크게 띄웁니다.',
      go: BOARD,
      target: button('.dv-act button', '벽면'),
      press: true,
    },
    {
      // 벽면에서 붉은 상자를 바로 누른다(업무 패널로 가면 벽면은 스스로 풀린다)
      id: 'wall', title: '상황실 벽면',
      say: '위 막대 · 트리 없이 보드만 크게. 붉은 상자를 누르면 그 업무의 패널로 갑니다.',
      hand: 'Esc나 ✕로 벽면에서 나온다',
      keep: true,
      target: (doc) => (onWall(doc) ? doc.querySelector(RED) : null),
      press: true,
    },
    {
      // 끌어서 고른 구간이 남아 있으면 실시간으로 되돌린다(exact)
      id: 'tiles', title: '핵심 지표',
      say: '트래픽 · 지연 시간 · 오류 · 포화도. 타일을 누르면 그 값을 낸 서비스로 갑니다.',
      point: 'RT p99 · TAT p99 · 대기 큐가 ■ 위험',
      go: PANEL, exact: true,
      target: '.biz .bz-kpis',
    },
    {
      id: 'chart', title: '지표 추이',
      say: '지표 추이에 경고 · 위험 선이 함께 그려집니다.',
      hand: '차트를 끌면 그 구간으로 좁혀지고 로그도 따라온다',
      go: PANEL,
      target: '.biz .bz-charts',
    },
    {
      id: 'pattern', title: '로그 패턴',
      say: '수십 줄이 몇 가지 패턴으로 묶입니다.',
      point: '로그 머리의 패턴',
      go: PANEL,
      // 앞 바퀴에서 남은 패턴 보기 · 좁힌 목록을 처음(목록)으로
      scene: [
        { click: PF + ' button.x', unless: none(PF) },
        { click: viewBtn('목록'), unless: none(PAT) },
      ],
      target: LOGS,
      press: [
        { click: viewBtn('패턴'), unless: PAT },
        { wait: PAT },
      ],
    },
    {
      id: 'patterns', title: '패턴으로 묶기',
      say: '숫자만 다른 줄이 한 패턴. 패턴을 누르면 그 줄만 남습니다.',
      keep: true,
      target: PAT,
      // 첫 패턴으로 좁히고 맨 윗줄을 펼친다
      press: [
        { click: PAT + ' tbody tr', unless: PF },
        { wait: PF },
        { click: LOGS + ' table.bz-log tbody tr', unless: DET },
        { wait: DET },
      ],
    },
    {
      id: 'logline', title: '로그 한 줄에서 타임머신',
      say: '줄을 펼치면 원문과 타임머신 링크. 그 시각의 서비스로 갑니다.',
      point: '체결 · match-01 · 타임머신 →',
      keep: true,
      target: DET,
    },
    {
      id: 'vendor', title: '줄어드는 장애',
      say: '값이 줄어드는 장애는 하한으로 잡습니다. 값 끊김 · 시간 외도 구분합니다.',
      point: '1분 시세량 ▼ 위험 · 아래 차트의 하한 경고 · 하한 위험 선',
      go: '#biz/vendor',
      target: '.biz .bz-kpis',
    },
    {
      id: 'collect', title: '로그 수집',
      say: '어느 로그 파일을 읽을지 화면에서 정합니다. 그룹에 정하면 서버가 물려받습니다.',
      point: '아래 적용 상태 · 원하는 버전 / 적용된 버전',
      go: COLLECT,
      target: FILES,
    },
    {
      id: 'wizard', title: '숫자 뽑기',
      say: '방금 본 1분 시세량이 여기서 만들어졌습니다.',
      point: 'quote 줄의 지표 biz.vendor.count_1m',
      go: COLLECT,
      target: quoteEdit,
      press: [
        { click: quoteEdit, unless: WIZ },
        { wait: WIZ + ' .cw-tabs' },
        { click: (doc) => [...doc.querySelectorAll(WIZ + ' .cw-tab')].find((b) => b.textContent.includes('숫자 뽑기')) || null, unless: METRICS },
        { wait: METRICS },
      ],
    },
    {
      id: 'pick', title: '로그 줄에서 지표로',
      say: '로그 줄의 recv= 숫자를 합계 · 최근 1분으로. 이것이 1분 시세량입니다.',
      point: '오른쪽 둘째 지표 biz.vendor.count_1m',
      keep: true,
      target: (doc) => (doc.querySelector(METRICS) ? doc.querySelector(WIZ + ' .cw-cols') : null),
      // lost=3 줄을 누르고, 나온 숫자 칩의 마지막(3)을 눌러 지표를 하나 더한다
      press: [
        { click: lostLine, unless: (doc) => !!doc.querySelector(THIRD) || !!lastNum(doc) },
        { wait: lastNum, unless: THIRD },
        { sleep: 500, unless: THIRD },
        { click: lastNum, unless: THIRD },
        { wait: THIRD },
      ],
    },
    {
      id: 'numpick', title: '숫자를 누르면 지표',
      say: '줄을 누르고 숫자 칩을 누르면 지표가 하나 더. 정규식은 이음이 씁니다.',
      point: 'biz.quote.lost · lost=(…)',
      hand: '다음을 누르면 3. 확인에서 예상 값이 나온다',
      keep: true,
      target: THIRD,
    },
  ],
};
