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

const K1 = '1 관제 운용';
const K2 = '2 원인 추적';
const K3 = '3 종료 보고서';
const K4 = '4 배치';
const K5 = '5 데이터를 마음대로 활용';
const KF = '+ 자연어로 배치 작업 생성';
const KB = '+ 자연어로 모니터링 위젯 생성';
const KM = '+ 그 밖에';

module.exports = [
  // ---- 인트로 ----
  { card: 'c-comic' },          // 상황실 만화(길이는 director.html의 COMIC 순서가 정한다, 약 17초)
  { card: 'c-logo', dur: 3.2 },

  // ---- ① 한 화면 관제 ----
  { stop: 'brief', k: K1, t: 'AI 브리핑이 <em>원인 후보 함수</em>까지 먼저 짚어 줍니다', look: 'target', dur: 3.6 },
  { stop: 'map', k: K1, t: '인프라 · 배치 · 업무 지표 · 장애 위험도를 한 화면에', dur: 3.4 },
  { stop: 'bizflow', k: K1, t: '업무 흐름이 막힌 곳은 <em>붉은 상자</em>로 바로 보입니다', look: 'target', dur: 3.4 },

  // ---- ② 알림에서 원인 함수까지 ----
  { card: 'c-sec1', dur: 3.2 },
  { stop: 'trace', k: K2, t: '체결이 밀리고 있네요. ✦ 원인 분석을 누르면', look: [990, 480, 600, 320], click: true, dur: 3.2 },
  { stop: 'steps', k: K2, t: '체계적인 순서로 <em>이음이 대신</em> 따라갑니다', look: [937, 83, 647, 420], dur: 3.4 },
  { stop: 'fn', k: K2, t: '평소(A)와 이상 구간(B)을 한눈에 비교, <em><code>book_insert</code> 15% → 63%</em>', look: 'target', dur: 4.4 },
  { stop: 'totm', k: K2, t: '<em>타임머신</em>을 타고 그때 상황으로 돌아가 봅니다', look: [937, 600, 647, 300], click: true, dur: 2.6 },
  { stop: 'tracks', k: K2, t: '업무 지표 · 서비스 CPU · 서버 CPU가 <em>한 시간축</em>에', look: [276, 96, 1308, 560], dur: 3.6 },
  { stop: 'flame', k: K2, t: '<em>플레임 그래프</em>로 평소(A)와 이상 구간(B)의 CPU 사용을 비교', look: [289, 380, 1282, 380], dur: 3.8 },
  { stop: 'verdict', k: K2, t: '장애를 재현할 필요 없이 <em>살펴볼 함수</em>를 바로 확인합니다', look: [289, 450, 1282, 400], dur: 5.0,
    punch: { at: 1.1, k: 'CPU 사용이 폭증한 함수', m: '<code>book_insert</code>', v: '15% <small>→</small> 63%', s: 'CPU 점유율 · 평소(A) → 이상 구간(B)' } },
  { stop: 'lineage', k: K2, t: '어디서 나온 프로세스냐고요? <em>실행 › 스텝 › 프로세스</em> 계보가 다 남습니다', look: [276, 100, 1000, 200], dur: 4.2 },

  // ---- ③ 죽은 이유를 코드 한 줄까지 ----
  { card: 'c-sec2', dur: 3.0 },
  { stop: 'report', k: K3, t: '서비스가 죽으면 바로 사망 진단서 발급: <em><code>book_insert</code>에서 NULL 역참조</em>', look: [276, 60, 1308, 400], dur: 4.4 },
  { stop: 'stack', k: K3, t: 'core 분석도 알아서, <em>호출 스택</em>과 크래시 지점 #0까지', look: [276, 291, 900, 260], dur: 3.4 },
  { stop: 'source', k: K3, t: '저장소에서 소스를 찾아 <em>문제가 된 119번째 줄</em>을 표시해 줍니다', look: [276, 200, 800, 330], dur: 3.8 },
  { stop: 'llm', k: K3, t: '이렇게 모은 근거를 <em>LLM</em>에 넘기면', look: [936, 640, 660, 150], click: true, dur: 2.4 },
  { stop: 'draft', k: K3, t: '왜 죽었나 · 코드 근거 · 수정 방향, <em>사람이 검토할 초안</em>', look: 'target', dur: 3.8 },

  // ---- ④ 배치 ----
  { stop: 'graph', k: K4, t: '분기 · 합류 · 서버 간 실행 · 재시도, 이런 스케줄링은 <em>기본</em>이죠', look: 'target', dur: 3.8 },
  { stop: 'held', k: K4, t: '<em>보류</em> 중인 작업이 있네요. 누르면 이유를 알려 줍니다', look: [289, 300, 520, 140], click: true, dur: 2.6 },
  { stop: 'heldwhy', k: K4, t: '체결 대기 큐 1020 &gt; 500. 업무가 밀리면 배치가 <em>알아서 기다립니다</em>', look: [289, 760, 760, 90], dur: 4.2 },

  // ---- ⑤ 데이터 주권 ----
  { stop: 'sql', k: K5, t: '쌓인 데이터는 <em>우리 DB</em>에. 표준 SQL로 꺼내 통계 · 머신러닝에', look: [40, 60, 1060, 440], dur: 4.2 },

  // ---- 몽타주: AI 초안 + 그 밖에 ----
  { card: 'c-more', dur: 2.8 },
  { stop: 'aiflow', k: KF, t: '필요한 작업을 <em>문장 한 줄</em>로 적으면', custom: 'aiflow' },
  { stop: 'aiflowed', k: KF, t: '작업 정의가 자동으로 만들어지고, <em>검증까지 자동으로</em>', dur: 3.0 },
  { stop: 'aidash', k: KB, t: '대시보드도 <em>문장 한 줄</em>로 입맛대로', click: true, dur: 1.4 },
  { stop: 'aiask', k: KB, t: '대시보드도 <em>문장 한 줄</em>로 입맛대로', look: [440, 280, 720, 340], click: true, dur: 2.2 },
  { stop: 'drafttag', k: KB, t: '위젯이 자동으로 붙고, <em>미리보기로 검토한 뒤 저장</em>', dur: 3.0 },
  { stop: 'risk', k: KM, t: '지난 장애 기록으로 학습한 <em>장애 위험도</em>', dur: 2.4 },
  { stop: 'numpick', k: KM, t: '업무 로그에서 바로 뽑아낸 <em>업무 지표</em>', look: [240, 40, 1110, 620], dur: 2.4 },
  { stop: 'patterns', k: KM, t: '쏟아지는 로그도 <em>패턴</em>으로 묶어서 한눈에', look: [276, 330, 900, 300], dur: 2.4 },
  { stop: 'audit', k: KM, t: '누가 · 언제 · 무엇을, <em>감사 기록</em>', dur: 2.4 },
  { stop: 'allinone', k: KM, t: '상황실 벽면 <em>All-in-One</em>', dur: 2.5 },

  // ---- 엔딩 ----
  { card: 'c-end1', dur: 4.2 },
  { card: 'c-end2', dur: 5.5 },
];
