// 써밋 시연판의 순서(발표자용). 엔진은 guide/stage.js, 막마다 파일 하나(show/a<번호>-<id>.js), 함께 쓰는 도우미는 show/util.js.
// 읽는 사람은 화면을 조작하는 우리 팀이다: say는 흘끗 보고 자기 말로 하는 큐(한두 문장), 화면에 보이는 낱말 그대로.
// 값은 summit 세계에서 고정인 것만 쓴다(위험도 72, book_insert 15% → 63%, 서버 46대, 플로우 41개). 시간 · 비용이 줄었다는 수치는 쓰지 않는다.
// 막 파일 하나가 깨져도 나머지는 뜨게 따로 불러온다(깨진 막은 빠지고 경고 한 줄).
import { undoDark } from './show/util.js';

const FILES = ['a0-cover', 'a1-glance', 'a2-trace', 'a3-biz', 'a4-batch', 'a5-svc', 'a6-risk', 'a7-board', 'a8-trust'];
// 어두운 테마로 보여 주는 장면. 이 밖의 닻 장면은 순서가 어둡게 해 둔 테마를 밝게 되돌리고 시작한다(숫자 키 · 목차 · 이전으로 건너뛰어도 어두움이 새지 않게).
const DARK = new Set(['dark', 'allinone']);

const acts = (await Promise.all(FILES.map((f) => import(`./show/${f}.js`)
  .then((m) => m.default)
  .catch((e) => { console.warn('[순서]', f, e && e.message ? e.message : e); return null; }))))
  .filter((a) => a && Array.isArray(a.stops) && a.stops.length)
  .map((a) => ({ ...a, stops: a.stops.map((s) => (!s || s.keep || DARK.has(s.id) ? s : { ...s, scene: [undoDark, ...(Array.isArray(s.scene) ? s.scene : [])] })) }));

export const SHOW = {
  title: '이음 써밋 시연판',
  // 정직 공시: 칩의 ⓘ와 목차에 보인다
  notes: [
    '화면의 서버와 수치는 모의 데이터입니다. 실제 서버 · 사내 데이터와 연결돼 있지 않습니다.',
    'AI 문장은 준비된 예시입니다. 실제 제품에서는 이음이 모은 근거로 LLM이 문장만 씁니다.',
    '조작은 이 브라우저 안에서만 반영됩니다. r을 누르면 처음 상태로 돌아갑니다.',
    'SQL 장면의 결과는 11-12 리허설 데이터(실제 서버 7대 + 모의 39대, 합성 부하)에서 eum sql로 실제로 뽑은 것입니다.',
  ],
  acts,
};
