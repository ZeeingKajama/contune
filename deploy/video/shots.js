// 부스 소개 영상의 촬영 순서. record.js가 위에서부터 차례로 찍고, compose.py가 이어 붙인다(이음새는 짧은 디졸브).
// 글을 고치려면 이 파일만 고치고 deploy/video/make.sh를 다시 돌린다.
//
// 한 줄(shot)의 필드
//   card   director.html의 전면 카드 id(인트로 만화 · 막 표지 · 엔딩). dur초 동안 보인다(만화는 dur 없이 제 길이만큼).
//   stop   써밋 시연판 장면 id(guide/show/*.js). 그 장면을 차린 뒤 dur초 찍는다.
//          앞 shot이 click으로 넘어왔으면 그 장면에 이미 와 있다(엔진이 press를 대신 하고 다음 장면을 차림).
//   k, t   자막: k는 작은 주황 머리글(막 이름, 숫자로 시작하면 숫자가 동그라미), t는 큰 줄(HTML, <em>은 주황 강조).
//          앞 shot과 같으면 다시 튀어나오지 않는다. 확대할 곳이 화면 아래라 자막에 가리면 자막이 위로 간다.
//   look   확대할 곳: 'target'(장면이 가리키는 요소) | [x, y, w, h](1600×900 화면 좌표) | 없음(전체).
//   max    확대 상한(기본 2.2)
//   punch  { at: 초, k, m, v, s }: at초에 화면을 어둡게 하고 가운데에 큰 숫자 카드
//   click  true면 장면이 가리키는 곳(press 자리)으로 커서가 가서 누르고, 엔진이 다음 장면을 차린다.
//          { sel, text }면 그 요소를 누른다(직접 누름, 엔진 press는 쓰지 않음).
//   custom record.js의 특수 동작 이름(aiflow: AI 초안 창을 열고 한 글자씩 친다)
// 값은 summit 세계에서 고정인 것만 쓴다(위험도 72, book_insert 15% → 63%, 서버 46대, 플로우 41개).

const K1 = '1 한 화면 관제';
const K2 = '2 원인 추적';
const K3 = '3 종료 보고서';
const K4 = '4 배치';
const K5 = '5 데이터 주권';
const KF = '+ 문장으로 플로우';
const KB = '+ 문장으로 보드';
const KM = '+ 그 밖에';

module.exports = [
  // ---- 인트로 ----
  { card: 'c-comic' },          // 상황실 만화(길이는 director.html의 COMIC 순서가 정한다, 약 17초)
  { card: 'c-logo', dur: 3.2 },

  // ---- ① 한 화면 관제 ----
  { stop: 'brief', k: K1, t: '열자마자 AI 브리핑, <em>원인 후보 함수</em>까지 먼저 짚습니다', look: 'target', dur: 4.2 },
  { stop: 'map', k: K1, t: '서버 <em>46대</em> · 배치 · 업무 지표 · 장애 위험도를 한 화면에', dur: 3.4 },
  { stop: 'bizflow', k: K1, t: '채널 → 체결 → 시세 → 지수 → 분배, <em>막힌 곳만 붉게</em>', look: 'target', dur: 3.8 },

  // ---- ② 알림에서 원인 함수까지 ----
  { card: 'c-sec1', dur: 3.2 },
  { stop: 'trace', k: K2, t: '체결 대기 큐 <em>위험</em> 알림. ✦ 원인을 누르면', look: [990, 480, 600, 320], click: true, dur: 3.2 },
  { stop: 'steps', k: K2, t: '알림 → 주인 찾기 → 구간 나누기 → 함수 비교, <em>이음이 대신</em> 따라갑니다', look: [937, 83, 647, 420], dur: 4.2 },
  { stop: 'fn', k: K2, t: '평소(A)와 알림 구간(B)을 견주니 <em><code>book_insert</code> 15% → 63%</em>', look: 'target', dur: 4.4 },
  { stop: 'totm', k: K2, t: '추적이 고른 A · B 구간 그대로 <em>타임머신</em>으로', look: [937, 600, 647, 300], click: true, dur: 2.6 },
  { stop: 'tracks', k: K2, t: '업무 지표 · 서비스 CPU · 서버 CPU가 <em>한 시간축</em>에', look: [276, 96, 1308, 560], dur: 4.0 },
  { stop: 'flame', k: K2, t: 'CPU를 쓴 함수를 그린 <em>플레임 그래프</em>, 평소(A)와 알림(B)', look: [289, 380, 1282, 380], dur: 4.0 },
  { stop: 'verdict', k: K2, t: '장애를 다시 일으키지 않고 <em>살펴볼 함수</em>가 나옵니다', look: [289, 450, 1282, 400], dur: 5.2,
    punch: { at: 1.1, k: '가장 늘어난 함수', m: '<code>book_insert</code>', v: '15% <small>→</small> 63%', s: 'CPU 점유율 · 평소(A) → 알림 구간(B)' } },
  { stop: 'lineage', k: K2, t: '이 서비스를 띄운 <em>실행 › 스텝 › 프로세스</em>까지 번호 하나로', look: [276, 100, 1000, 200], dur: 4.0 },

  // ---- ③ 죽은 이유를 코드 한 줄까지 ----
  { card: 'c-sec2', dur: 3.0 },
  { stop: 'report', k: K3, t: '서비스가 죽으면 한 장: <em><code>book_insert</code>에서 NULL 역참조</em>', look: [276, 60, 1308, 400], dur: 4.0 },
  { stop: 'stack', k: K3, t: 'core에서 꺼낸 <em>호출 스택</em>, 크래시 지점 #0', look: [276, 291, 900, 260], dur: 3.2 },
  { stop: 'source', k: K3, t: '저장소에서 소스를 찾아 <em>죽은 줄 119</em>를 칠해 둡니다', look: [276, 200, 800, 330], dur: 4.2 },
  { stop: 'llm', k: K3, t: '근거와 코드 토막을 <em>LLM</em>에 넘기면', look: [936, 640, 660, 150], click: true, dur: 2.4 },
  { stop: 'draft', k: K3, t: '왜 죽었나 · 코드 근거 · 고칠 방향, <em>사람이 검토할 초안</em>', look: 'target', dur: 4.2 },

  // ---- ④ 배치 ----
  { stop: 'graph', k: K4, t: '갈래 · 합류 · 서버 넘기. <em>load-equity</em>는 재시도 끝에 성공', look: 'target', dur: 3.8 },
  { stop: 'held', k: K4, t: '정산 스텝이 <em>보류</em>? 누르면 까닭이 나옵니다', look: [289, 300, 520, 140], click: true, dur: 2.6 },
  { stop: 'heldwhy', k: K4, t: '체결 대기 큐 <em>1020 &gt; 500</em>, 업무가 밀리면 배치가 기다립니다', look: [289, 760, 760, 90], dur: 4.4 },

  // ---- ⑤ 데이터 주권 ----
  { stop: 'sql', k: K5, t: '쌓인 데이터는 <em>우리 DB</em>에. 표준 SQL로 꺼내 통계 · 학습에', look: [40, 60, 1060, 440], dur: 4.6 },

  // ---- 몽타주: AI 초안 + 그 밖에 ----
  { card: 'c-more', dur: 2.8 },
  { stop: 'aiflow', k: KF, t: '바라는 작업을 <em>문장 한 줄</em>로 적으면', custom: 'aiflow' },
  { stop: 'aiflowed', k: KF, t: '스텝 둘 + 매일 18:00 스케줄 초안, <em>검증을 통과해야 저장</em>', dur: 2.8 },
  { stop: 'aidash', k: KB, t: '보드도 <em>문장 한 줄</em>로 위젯을 더합니다', click: true, dur: 1.4 },
  { stop: 'aiask', k: KB, t: '보드도 <em>문장 한 줄</em>로 위젯을 더합니다', look: [440, 280, 720, 340], click: true, dur: 2.2 },
  { stop: 'drafttag', k: KB, t: '위젯 +2 · 바뀜 1, <em>미리보기로 검토 뒤 저장</em>', dur: 2.8 },
  { stop: 'risk', k: KM, t: '지난 장애로 배운 <em>장애 위험도</em>', dur: 2.0 },
  { stop: 'numpick', k: KM, t: '로그 줄의 숫자를 <em>업무 지표</em>로', look: [240, 40, 1110, 620], dur: 2.0 },
  { stop: 'patterns', k: KM, t: '수십 줄 로그를 <em>패턴</em>으로 묶기', look: [276, 330, 900, 300], dur: 2.0 },
  { stop: 'audit', k: KM, t: '누가 · 언제 · 무엇을, <em>감사 기록</em>', dur: 2.0 },
  { stop: 'allinone', k: KM, t: '상황실 벽면 <em>All-in-One</em>', dur: 2.5 },

  // ---- 엔딩 ----
  { card: 'c-end1', dur: 4.2 },
  { card: 'c-end2', dur: 5.5 },
];
