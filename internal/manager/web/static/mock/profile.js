// 프로필: mock 세계의 크기와 줄거리를 고른다.
//   full  개발 · 팀 리뷰용 미리보기(기본). 서버 46대 · 플로우 41개 · 줄거리 여럿
//   lite  체험판(deploy/judge_demo.sh). 서버 9대 · 플로우 7개 · 줄거리 하나, 화면 위 가이드가 켜진다
//   summit 써밋 시연판(deploy/summit_demo.sh). full 크기 세계(46대 · 41개 · 줄거리 전부)에 체험판의 조작 반영 · 숫자 맞춤 · 시각 고정을 켜고,
//          발표자용 순서 가이드(guide/stage.js)가 켜진다
// 고르는 순서: 빌드가 박은 값(FIXED) → globalThis.EUM_PROFILE → 주소 쿼리 profile=lite|summit(해시 쪽 쿼리도 본다) → full.
// 표가 모듈을 불러올 때 굳고 세계도 한 번만 만들어지므로, 페이지를 연 뒤에는 바꾸지 못한다.
// 이 파일은 아무것도 import하지 않는다(어느 mock 모듈에서든 먼저 불러올 수 있게).
const FIXED = ''; // 빌드 고정: deploy/judge_demo.sh가 'lite'로, deploy/summit_demo.sh가 'summit'으로 바꾼다

function read() {
  if (FIXED) return FIXED;
  try { if (globalThis.EUM_PROFILE) return String(globalThis.EUM_PROFILE); } catch (e) { /* 무시 */ }
  try {
    if (typeof location !== 'undefined') {
      const s = new URLSearchParams(location.search).get('profile');
      if (s) return s;
      const h = location.hash.split('?')[1];
      const v = h ? new URLSearchParams(h).get('profile') : null;
      if (v) return v;
    }
  } catch (e) { /* 무시 */ }
  return 'full';
}

const P = read();
export const PROFILE = P === 'lite' ? 'lite' : P === 'summit' ? 'summit' : 'full';
export const LITE = PROFILE === 'lite';
export const SUMMIT = PROFILE === 'summit';
// 체험판 · 시연판 공통: 조작 반영 · 화면 간 숫자 맞춤 · 시각 고정 · LLM 켜기. full에서는 늘 false라 full 응답은 바뀌지 않는다.
export const DEMO = LITE || SUMMIT;
// 프로필에 따라 값을 고른다. full 쪽 값은 지금까지의 값을 그대로 넘겨 full 응답이 바뀌지 않게 한다.
// pick은 세계 크기(lite만 줄인다: summit은 full 값), pickDemo는 체험판 · 시연판 공통 보정.
export const pick = (full, lite) => (LITE ? lite : full);
export const pickDemo = (full, demo) => (DEMO ? demo : full);
