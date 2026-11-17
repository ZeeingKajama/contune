// 막 0 · 표지. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
import { toLight } from './util.js';

export default {
  id: 'cover',
  title: '표지',
  stops: [
    {
      id: 'cover', title: '표지',
      say: '따로 보던 스케줄러 · 서버 관제 · 업무 관제를 한 제품으로 만들었습니다.',
      // 끝 무렵 어두운 테마 장면이 있다. 테마는 r(처음 상태로)로도 안 돌아오니 표지가 밝게 되돌린다.
      go: '#dashboard', scene: [toLight],
      slide: {
        kind: 'cover',
        title: '이음 E:UM',
        lead: '배치 · 서버 · 업무 · 함수 추적을 하나로',
        chips: [
          '실행 번호 하나가 모든 기록을 잇는다',
          '서버 46대 · 플로우 41개 · 업무 패널 7개',
          '알림에서 원인 함수까지 두 번',
          'Go 단일 바이너리 · 우리 DB · SQL',
        ],
        foot: '방탄소녀단', // '→ 로 시작'은 뺐다: 바로 아래에 엔진이 '→ 시작' 단추를 그린다
      },
    },
  ],
};
