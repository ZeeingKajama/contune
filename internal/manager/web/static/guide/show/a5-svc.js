// 막 5 · 서비스가 죽으면. 순서와 큐 문구 초안은 .run/summit/ORDER.md, 장면 필드는 .run/summit/SPEC.md §3.1.
// 서비스 목록 → 죽고 다시 뜬 계보 → 종료 보고서 목록 → 보고서 한 장(원인 · 호출 스택 · 소스 · LLM 참고 초안 · 코드 근거 · 붙여넣기).
import { byText } from './util.js';

// 체결 서비스(matching_svc)가 book_insert에서 죽은 보고서. mock/exit.js의 IDS.crash: 씨앗이 고정이라 여는 날과 무관하게 같다.
const REPORT = '#exit/01M6SJCSX8Z20P255E4SX2HSQ9';
// 종료 보고서 목록에서 그 보고서의 줄
const crashRow = byText('.exl-tbl tbody tr', 'book_insert');
// LLM 참고 초안 칸의 단추 둘: 맡기기(초안이 있으면 '다시 맡기기') · 보낼 내용
const LLM_BTNS = '#ex-llm .ex-ch button';
const llmBtn = (doc) => doc.querySelector(LLM_BTNS + '.primary');
const pasteBtn = byText(LLM_BTNS, '보낼 내용');
const DRAFT = '#ex-llm .ex-draft';
// 초안의 코드 근거 가운데 첫 줄(소스 카드의 토막 안: 누르면 그 줄로 간다)
const firstRef = (doc) => doc.querySelector(DRAFT + ' .ex-crefs button.ex-cref');
// 코드 근거를 눌러 칠해진 줄(.cl.ref)이 든 코드 칸
const REF_LINE = '#ex-ev-source .cl.ref';
const refCode = (doc) => { const l = doc.querySelector(REF_LINE); return l ? l.closest('.ex-code') : null; };
// 보낼 내용 서랍
const DRAWER = '#drawer.ex-drawer';

export default {
  id: 'svc',
  title: '서비스가 죽으면',
  stops: [
    {
      id: 'svcs', title: '서비스',
      say: '늘 떠 있어야 할 프로그램입니다. 체결이 match-02에는 안 떠 있습니다.',
      point: '붉은 ■ match-02 · 오른쪽 위 없음 1',
      go: '#svcs', target: '.sv-tbl',
    },
    {
      id: 'svrb', title: '죽고 다시 뜬 기록',
      say: '스텝 하나가 띄운 셋 가운데 svr_b만 SIGSEGV. 다시 돌린 실행이 svr_b만 다시 띄웠습니다.',
      point: '■ SIGSEGV → 를 누르면 그 종료 보고서',
      go: '#svc/svr_b?host=batch-02', target: 'section.tm-card.sv-lg',
    },
    {
      id: 'exits', title: '종료 보고서',
      say: '신호로 죽거나 오류로 끝난 프로세스마다 한 장. 신호 · 원인 · 기동한 실행이 한 줄에 있습니다.',
      point: 'matching_svc ■ SIGSEGV 줄을 누릅니다',
      go: '#exits', target: '.exl-tbl',
      press: [
        { click: crashRow },
        { wait: '#ex-cause' },
      ],
    },
    {
      id: 'report', title: '사망 진단서',
      say: 'book_insert에서 NULL 역참조. 규칙이 판단하고 근거를 답니다.',
      point: '근거 칩을 누르면 그 칸으로 갑니다',
      go: REPORT, target: '#ex-cause',
    },
    {
      id: 'stack', title: '호출 스택',
      say: 'core에서 꺼낸 호출 스택. #0 크래시 지점이 book_insert, matching_svc.c:119입니다.',
      go: REPORT, target: '#ex-ev-core',
    },
    {
      id: 'source', title: '죽은 줄',
      say: '저장소에서 찾은 소스. 죽은 곳 119줄이 붉게 칠해져 있습니다.',
      point: '오른쪽 위 버전 · 일치: 죽은 실행 파일과 같은 코드',
      go: REPORT, target: '#ex-ev-source',
    },
    {
      id: 'llm', title: 'LLM에 맡기기',
      say: '근거 묶음과 코드 토막을 LLM에 넘깁니다. 여기서 받는 답은 준비된 예시입니다.',
      point: '이미 맡겼으면 단추가 다시 맡기기로 바뀌어 있습니다',
      go: REPORT, target: llmBtn,
      // 초안은 세계에 남는다: 이미 있으면(둘째 바퀴 · 되감기) 다시 맡기지 않고 그대로 넘어간다
      press: [
        { wait: LLM_BTNS },
        { click: llmBtn, unless: DRAFT },
        { wait: DRAFT, ms: 15000 },
      ],
    },
    {
      id: 'draft', title: '참고 초안',
      say: '왜 죽었나 · 코드 근거 · 고칠 방향. 사람이 검토할 참고 초안입니다.',
      point: '저장된 원인은 위의 규칙 판단 그대로',
      keep: true, target: DRAFT,
    },
    {
      id: 'cref', title: '코드 근거',
      say: '코드 근거를 누르면 소스 카드의 그 줄로 갑니다.',
      keep: true, target: DRAFT + ' .ex-crefs',
      press: [
        { click: firstRef },
        { wait: REF_LINE },
      ],
    },
    {
      id: 'refline', title: '소스의 그 줄',
      say: '칠해진 117–119줄. cold_head를 NULL 확인 없이 읽는 자리입니다.',
      keep: true, target: refCode,
    },
    {
      id: 'paste', title: 'LLM이 없어도',
      say: '사내 LLM이 없어도 됩니다. 보낼 내용을 복사해 다른 LLM에 붙여 넣습니다.',
      go: REPORT, target: pasteBtn,
      press: [
        { click: pasteBtn, unless: DRAWER },
        { wait: DRAWER + ' pre.ex-pre' },
      ],
    },
    {
      id: 'prompt', title: '보낼 내용',
      say: '근거 묶음과 코드 토막이 그대로 들어 있습니다. 비밀처럼 보이는 값은 가려서 나갑니다.',
      point: 'cmdline의 --token=***',
      keep: true, target: DRAWER + ' pre.ex-pre.tall',
    },
    {
      id: 'answer', title: '답 붙여넣기',
      say: '받은 답을 붙여 넣으면 근거 ID와 코드 범위를 검사한 뒤 초안으로 저장합니다.',
      keep: true, target: DRAWER + ' .ex-pastebox',
    },
  ],
};
