// 막 6 · 미리 안다. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 전부 #risk 한 화면이다(같은 화면이라 다시 그리지 않는다: 구간 · 접힌 칸은 장면이 맞춘다).
// 이상 없음은 한 번 저장하면 그 요인이 아래 '이상 없음' 줄로 내려간다. 풀지 않는다: 다시 들어오면 이미 된 상태(43 · 전체 72)를 보여 준다.
import { button } from './util.js';

const RISK = '#risk';
const HEAD = 'section.rbox.rhead';
const CHECK = 'section.rbox.rcheck';

// 확인할 것의 대기 큐 줄(첫 요인): 아직 확인 전이면 이상 없음 단추, 처리했으면 held 줄
const HELD = CHECK + ' .rrow.held[data-f="queue"]';
const held = (doc) => !!doc.querySelector(HELD);
const okBtn = (doc) => doc.querySelector(CHECK + ' .rrow:not(.held)[data-f="queue"] .rc-act button');
const FORM = CHECK + ' .rrow[data-f="queue"] form.racc';
const formOpen = (doc) => !!doc.querySelector(FORM);

// 추이의 구간 단추
const rangeBtn = (text) => button('.rbox .trseg button', text);
const rangeOn = (text) => (doc) => { const b = rangeBtn(text)(doc); return !!b && b.classList.contains('on'); };

// 접힌 칸(이상 없음 기록 · 모델 · 장애 기록): 이름으로 찾는다
const fold = (name) => (doc) => [...doc.querySelectorAll('.rfolds details.rfold')].find((d) => ((d.querySelector('summary b') || {}).textContent || '').trim() === name) || null;
const isOpen = (name) => (doc) => { const d = fold(name)(doc); return !!d && d.open; };
const summary = (name) => (doc) => { const d = fold(name)(doc); return d ? d.querySelector('summary') : null; };
const openFold = (name) => ({ click: summary(name), unless: isOpen(name) });
const shutFold = (name) => ({ click: summary(name), unless: (doc) => !isOpen(name)(doc) });

export default {
  id: 'risk',
  title: '미리 안다',
  stops: [
    {
      id: 'risk', title: '장애 위험도',
      say: '지난 장애 기록으로 학습한 0~100 지수. 지금 72, 위험입니다.',
      point: '바로 아래 ■ 장애 진행 중 · 자동: 체결 · 대기 큐 위험',
      go: RISK,
      target: HEAD,
    },
    {
      id: 'factors', title: '확인할 것',
      say: '요인마다 지금 값 · 평소 값 · 어디서. 칩을 누르면 그 화면으로 갑니다.',
      go: RISK,
      target: CHECK,
    },
    {
      id: 'hold', title: '이상 없음',
      say: '확인한 요인은 이유를 적고 이상 없음으로 뺍니다.',
      point: '대기 큐 줄 끝 이상 없음',
      go: RISK,
      target: (doc) => okBtn(doc) || doc.querySelector(HELD),
      // 이미 처리했으면(둘째 바퀴 · 되감기) 아무것도 하지 않고 넘어간다
      press: [
        { click: okBtn, unless: (doc) => held(doc) || formOpen(doc) },
        { wait: FORM, unless: held },
        { fill: FORM + ' input[name="reason"]', value: '원인 확인함 · 조치 중', unless: held },
        { sleep: 700, unless: held },
        { click: FORM + ' button.acc', unless: held },
        { wait: held },
      ],
    },
    {
      id: 'held43', title: '72 → 43',
      say: '위험도는 43으로 내려가고, 전체 72는 그대로 남습니다.',
      point: '전체 72 · 이상 없음 1 · 아래 이상 없음 줄의 해제',
      keep: true,
      target: (doc) => (held(doc) && doc.querySelector(HEAD + ' .rhead-sub') ? doc.querySelector(HEAD) : null),
    },
    {
      id: 'trend', title: '추이',
      say: '붉은 띠가 장애 구간. 선이 경고 · 위험 선을 넘습니다.',
      go: RISK,
      scene: [
        { click: rangeBtn('15분'), unless: rangeOn('15분') },
        { wait: rangeOn('15분') },
        { sleep: 500 },
      ],
      target: '.rbox .chart',
    },
    {
      id: 'incidents', title: '장애 기록',
      say: '자동으로 열린 장애 기록은 확인 전입니다. 장애로 확인을 눌러야 학습에 쓰입니다.',
      point: '출처 칸 자동 · 확인 전',
      go: RISK,
      scene: [shutFold('모델'), openFold('장애 기록')],
      target: (doc) => (isOpen('장애 기록')(doc) ? fold('장애 기록')(doc) : null),
    },
    {
      id: 'model', title: '모델',
      say: '언제 학습했고 무엇에 무게를 두는지 보입니다. 판단을 대신하지 않는 참고 지표입니다.',
      point: '맨 위 모델 줄의 학습 시각 · 가중치가 큰 요인은 대기 큐 · p99 응답 시간',
      go: RISK,
      scene: [shutFold('장애 기록'), openFold('모델')],
      target: (doc) => (isOpen('모델')(doc) ? doc.querySelector('.rfolds table.wtbl') : null),
    },
  ],
};
