// 막 1 · 한눈에. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
import { enc } from './util.js';

const HOME = '#dashboard';
const GROUP = '매매체결';
const SCOPED = HOME + '?g=' + enc(GROUP);

// 시간대별 배치에서 막대를 눌러 편 목록. 같은 화면에 다시 들어오면 그대로 남아 있으니 관제 장면마다 접고 시작한다.
const PICK = '.dtl .tl-pick';
const closePick = { click: PICK + ' .tl-x', unless: (doc) => !doc.querySelector(PICK) };

// 트리의 그룹 줄. 서버 뿌리가 접혀 있으면 줄이 없다 → 먼저 편다.
const groupRow = (doc) => {
  const l = doc.querySelector(`#tree .tnode .tl[title="${GROUP}"]`);
  return l ? l.closest('.tnode') : null;
};
const hostRootTw = (doc) => {
  const r = [...doc.querySelectorAll('#tree .tnode.troot')].find((x) => (x.querySelector('.tl') || {}).textContent === '서버');
  return r ? r.querySelector('.tw') : null;
};
const scoped = () => /[?&]g=/.test(location.hash);

// 누를 막대: 실패가 든 가장 늦은 시간. 없으면 지금 시간, 그것도 비었으면 플로우가 있는 마지막 시간.
const hourBar = (doc) => {
  const cols = [...doc.querySelectorAll('.dtl .tl-col')].filter((c) => !c.disabled);
  const failed = cols.filter((c) => c.querySelector('.tl-seg.failed'));
  return failed[failed.length - 1] || cols.find((c) => c.classList.contains('now')) || cols[cols.length - 1] || null;
};

export default {
  id: 'glance',
  title: '한눈에',
  stops: [
    {
      id: 'brief', title: 'AI 상황 브리핑',
      say: '열자마자 지금 상황 세 줄. 근거는 이음이 모으고 AI는 문장만 씁니다.',
      point: '줄 끝 칩이 그 줄의 근거 · 오른쪽 원인 추적 book_insert 15% → 63%',
      go: HOME, exact: true, scene: [closePick],
      target: '.ai-slot > section.ai-brief',
    },
    {
      id: 'cards', title: '카드 네 장',
      say: '장애 위험도 · 서버 · 금일 배치 · 업무 지표. 누르면 그 화면으로 갑니다.',
      point: '장애 위험도 72 · 서버 이상 3 / 46',
      go: HOME, exact: true, scene: [closePick],
      target: '.dash-main .cards',
    },
    {
      id: 'map', title: '서버 46대',
      say: '한 칸이 서버 한 대. 진할수록 CPU가 높고 ! ✕ – 는 경고 · 위험 · 무응답입니다.',
      point: '! match-01 · ✕ dw-02 · – ext-04',
      go: HOME, exact: true, scene: [closePick],
      target: 'section.dpanel.dmap',
    },
    {
      id: 'scope', title: '그룹으로 좁히기',
      say: '트리에서 그룹을 누르면 화면 전체가 그 그룹만 봅니다.',
      point: '왼쪽 트리의 매매체결',
      go: HOME, exact: true,
      scene: [closePick, { wait: '#tree .tnode.troot' }, { click: hostRootTw, unless: (doc) => !!groupRow(doc) }],
      target: groupRow,
      press: [
        { click: groupRow, unless: scoped },
        { wait: '.tree-chip' },
      ],
    },
    {
      // 닻으로 둔다: 어디서 건너뛰어 와도 주소만으로 좁혀진다
      id: 'scoped', title: '매매체결만',
      say: '서버 카드 · 서버 맵 · 실시간 이벤트가 매매체결 8대로 좁혀졌습니다. ✕로 풉니다.',
      point: '트리 맨 위 매매체결 ✕',
      go: SCOPED,
      target: 'section.dpanel.dmap',
    },
    {
      id: 'events', title: '실시간 이벤트',
      say: '서버 · 배치 · 업무 알림이 심한 순으로 한 목록에 옵니다.',
      point: '줄을 누르면 그 화면 · ✦ 원인은 다음 막에서',
      go: HOME, exact: true, scene: [closePick],
      target: 'section.dpanel.dwatch',
    },
    {
      id: 'hours', title: '시간대별 배치',
      say: '오늘 배치를 시간대로. 실패 · 실행 중 · 성공 · 예정이 한 막대에 쌓입니다.',
      point: '세로선이 지금 · 점선이 남은 예정',
      go: HOME, exact: true, scene: [closePick],
      target: 'section.dpanel.dtl',
      press: [
        { click: hourBar, unless: PICK },
        { wait: PICK },
      ],
    },
    {
      id: 'hourlist', title: '그 시간의 플로우',
      say: '막대를 누르면 그 시간의 플로우 목록. 줄을 누르면 그 실행의 플로우 그래프로 갑니다.',
      keep: true,
      target: PICK,
    },
    {
      id: 'server', title: '서버 한 대',
      say: '서버 맵의 칸을 누르면 그 서버. 탭마다 지금 값과 추이, 아래는 고른 구간의 차트입니다.',
      point: 'match-01 CPU 경고 · 구간 15분 ~ 7일 · 직접 지정',
      go: '#host/match-01/overview',
      target: '.srv-tabs',
    },
    {
      id: 'host', title: '프로세스의 주인',
      say: '프로세스마다 주인이 붙습니다. 서비스 묶음, 아니면 띄운 실행 › 스텝.',
      point: 'ref_cache 줄의 서비스로 등록',
      go: '#host/batch-02/proc',
      target: 'table.srv-ptbl',
    },
  ],
};
