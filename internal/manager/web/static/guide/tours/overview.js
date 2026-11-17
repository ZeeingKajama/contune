// 투어 0: 화면 둘러보기. 관제 화면에서 위 메뉴 → 왼쪽 트리 → 카드 4장 → 서버 맵 → 실시간 이벤트 → 알림 종을 읽기만 한다(전부 '다음').
// 관제 본문(.dash-main)은 2초마다 통째로 새로 그려진다(pages/dashboard.js render): 선택자만 주고 요소는 엔진이 매번 다시 찾는다.
// 왼쪽 트리는 폭 900px 이하에서 숨는다(style.css): 그때는 같은 목록으로 들어가는 위 메뉴를 가리킨다(목표가 없으면 길 잃음 안내가 뜬다).
const GO = '#dashboard';

function treeOrMenu(doc) {
  const tree = doc.querySelector('#tree');
  return tree && tree.getClientRects().length ? tree : doc.querySelector('#menu');
}

export default {
  id: 'overview',
  title: '화면 둘러보기',
  minutes: 1,
  who: '누구나',
  summary: '메뉴와 관제 화면의 짜임을 먼저 봅니다.',
  steps: [
    {
      title: '위 메뉴',
      body: '이음은 따로 보던 서버·배치·업무를 한 곳에 모았습니다. 위 메뉴의 관제·서버·배치·업무·보드·실행이 그 화면들이고, 지금은 관제에 있습니다.',
      terms: [['관제', '지금 문제가 있는지 지켜보는 일'], ['배치', '정해진 시각에 차례로 도는 작업']],
      go: GO,
      target: '#menu',
      advance: 'next',
    },
    {
      title: '왼쪽 트리',
      body: '서버는 그룹으로, 배치는 배치판으로 묶여 있고, 이름을 누르면 그 화면으로 갑니다. 화면이 좁으면 트리 대신 위 메뉴의 서버·배치로 들어갑니다.',
      terms: [['배치판', '플로우를 묶는 폴더'], ['플로우', '순서와 재시도가 정해진 작업 묶음']],
      go: GO,
      target: treeOrMenu,
      advance: 'next',
    },
    {
      title: '카드 네 장',
      body: '지금 상황을 카드 네 장으로 줄였습니다. 장애 위험도, 서버, 금일 배치, 업무 지표이고, 카드를 누르면 그 화면으로 갑니다.',
      terms: [['장애 위험도', '지난 장애 기록으로 학습한 0~100 참고 지수. 판단을 대신하지 않습니다']],
      go: GO,
      target: '.dash-main .cards',
      advance: 'next',
    },
    {
      title: '서버 맵',
      body: '한 칸이 서버 한 대입니다. 정상인 칸에는 CPU 사용률이, 문제가 있는 칸에는 색과 표시가 보이고, 칸을 누르면 그 서버로 갑니다.',
      go: GO,
      target: '.dpanel.dmap',
      advance: 'next',
    },
    {
      title: '실시간 이벤트',
      body: '지금 진행 중인 알림이 심한 순으로 한 목록에 모입니다. 서버·배치·업무 어디서 났든 여기서 봅니다.',
      go: GO,
      target: '.dpanel.dwatch',
      advance: 'next',
    },
    {
      title: '알림 종',
      body: '어느 화면에 있든 위 막대의 종에 아직 확인하지 않은 알림 수가 보입니다. 누르면 알림 목록이 열립니다.',
      go: GO,
      target: '#bell',
      advance: 'next',
    },
  ],
  done: {
    title: '둘러보기 끝',
    body: '서버·배치·업무가 한 화면에 모여 있고, 이상은 실시간 이벤트 한 목록으로 옵니다. 이제 알림 하나를 골라 원인까지 따라가 보세요.',
    links: [{ label: '서버 목록', hash: '#hosts' }, { label: '알림 목록', hash: '#alerts' }],
    next: 'trace',
  },
};
