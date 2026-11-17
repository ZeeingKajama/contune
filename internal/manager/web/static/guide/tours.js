// 체험 가이드 내용: 처음 화면(INTRO) · 투어 목록(TOURS) · 더 둘러보기(MORE). 엔진은 guide.js, 투어는 하나에 파일 하나(tours/<id>.js).
// 읽는 사람은 우리 업무를 모른다: 한 단계에 한 가지, 한두 문장, 화면에 보이는 낱말 그대로(단추 이름은 화면 글자 그대로).
// 값은 박지 않고 가리킨다(데이터가 조금 달라져도 맞게). 시간·비용이 줄었다는 수치는 쓰지 않는다(실측 전).
// 낱말은 화면 용어대로: 플로우 · 스텝 · 배치판 · 대기 큐 · 타임머신 · 플레임 그래프.
import overview from './tours/overview.js';
import trace from './tours/trace.js';
import batch from './tours/batch.js';
import exit from './tours/exit.js';
import board from './tours/board.js';

export const INTRO = {
  title: '이음 체험판',
  lead: '이음(E:UM)은 배치 실행·서버 관제·업무 관제를 하나로 합쳐, 알림에서 원인 함수까지 한 곳에서 따라가게 하는 운영 도구입니다. 아래 사용 예를 골라 직접 눌러 보세요.',
  // 정직 공시
  notes: [
    '화면의 서버와 수치는 모의 데이터입니다. 실제 서버·사내 데이터와 연결돼 있지 않습니다.',
    'AI 문장은 준비된 예시입니다. 실제 제품에서는 이음이 모은 근거로 LLM이 문장만 씁니다.',
    '누른 조작은 이 브라우저 안에서만 반영되고, 새로 고치면 처음으로 돌아갑니다.',
  ],
};

export const TOURS = [overview, trace, batch, exit, board];

// 더 둘러보기: 투어에 넣지 않은 화면
export const MORE = [
  { label: '장애 위험도', hash: '#risk', desc: '0~100 지수와 높아진 요인. 확인한 요인은 이상 없음으로 뺍니다' },
  { label: '서버 상세', hash: '#host/match-01/overview', desc: '서버 한 대의 CPU·메모리·디스크·네트워크와 거기서 도는 프로세스' },
  { label: '서비스 목록', hash: '#svcs', desc: '늘 떠 있어야 하는 프로그램이 서버마다 살아 있는지' },
  { label: '실행 이력', hash: '#runs', desc: '모든 스텝 실행을 한 표로: 언제, 어느 서버에서, 몇 번째 시도로 끝났나' },
  { label: '로그 수집', hash: '#collect', desc: '어느 서버의 어떤 로그 파일을 읽을지 화면에서 정합니다' },
  { label: '감사 기록', hash: '#audit', desc: '누가 언제 무엇을 했는지 남는 기록' },
  { label: '플로우 편집기', hash: '#edit/market-open', desc: '작업 순서를 그림으로 고치는 화면' },
];
