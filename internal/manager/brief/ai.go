package brief

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"eum/internal/manager/llm"
	"eum/internal/model"
)

// LLM 계약(관제 AI). 종료 보고서(카드 T 계약 7)와 같은 원칙: 근거 묶음만 보고, JSON 하나로 답하고,
// 근거 ID는 묶음에 있는 것만. 어기면 답을 버리고 규칙 문장을 쓴다.
const (
	maxPrompt      = 16 * 1024
	traceMaxTokens = 700
	briefMaxTokens = 700
	maxTraceTitle  = 60 // 프롬프트는 40자 안을 권하고, 이 상한을 넘는 답은 버린다(규칙 문장)
	maxHeadline    = 60
	maxLine        = 90
	maxLines       = 4
	maxChecks      = 3 // 추적 판단의 점검 항목
	maxBriefChecks = 2 // 브리핑의 점검 항목
	maxDetail      = 160
	maxCheckLen    = 60
	maxCite        = 3 // 판단·줄 하나에 붙는 근거 칩(넘는 것은 버린다: 결론을 가른 것만)
)

var traceSystem = `당신은 서버 장애 분석을 돕는 보조입니다. 알림 하나에 대해 관측 도구(이음)가 모은 근거 묶음(JSON)만 보고, 원인 후보 함수와 그 까닭을 운영자에게 알립니다.
- 근거 묶음에 있는 사실만 씁니다. 소스 코드 내용, 배포 이력, 다른 서버처럼 묶음에 없는 것은 지어내지 않습니다.
- Self CPU 점유율은 CPU 프로파일 샘플 비율입니다. 점유율이 늘었다는 것은 그 함수가 CPU를 더 썼다는 뜻이지 버그의 증명이 아닙니다. 같은 구간의 유입 변화와 함께 봅니다.
- 근거가 모자라거나 확실하지 않으면 confidence를 "low"로 답합니다.
- 함께 주는 규칙 판단은 참고일 뿐입니다. 근거와 맞지 않으면 따르지 않습니다.
- JSON 객체 하나만 답합니다. 앞뒤에 설명 글을 붙이지 않습니다.
- 답은 추적 단계(대상 식별 → 비교 구간 → 프로파일 비교 → 콜스택 → 동시간대 지표) 바로 아래에 걸립니다. 점유율·콜스택·지표 값은 단계에 이미 보이므로 다시 나열하지 않고, 결론과 해석만 씁니다.

` + llm.Style + `

스키마:
{"title": "...", "detail": "...", "confidence": "high|medium|low", "evidence_ids": ["..."], "next_checks": ["..."]}
- title: 결론 한 줄, 40자 안(길어도 60자). "원인 후보 + 증상 — 유발 요인" 꼴. 수치는 배수 하나까지. 예: "route_msg CPU 포화 — 수신 TPS ×3.1"
- detail: 단계만 봐서는 알 수 없는 해석 하나 또는 근거의 한계 하나를 한 줄(80자 안)로. 수치 재나열 금지. 쓸 것이 없으면 "".
- confidence: high | medium | low
- evidence_ids: 결론을 가른 근거의 id만 1~3개(근거 묶음 evidence[].id)
- next_checks: 최대 3개, 항목마다 35자 안, "대상 + 볼 것 + 확인" 꼴. "지속 여부 확인", "추이 확인"처럼 지켜보라는 항목은 넣지 않습니다`

var briefSystem = `당신은 관제실 운영자를 돕는 보조입니다. 관측 도구(이음)가 모은 지금 상황의 근거 묶음(JSON)만 보고, 관제 화면 맨 위 상황 브리핑의 제목과 판단을 씁니다.
- 화면은 근거에서 칸을 바로 그립니다: 대표 이슈의 현상(알림 값 · 임계치), 추정 원인(함수 · Self CPU 점유율 · 콜스택 · 유발 요인), 권장 조치, 기타 이슈. 당신의 글은 그 칸들 위에 걸립니다. 칸에 보이는 수치를 옮겨 적지 않고, 칸들을 이어 읽는 판단만 씁니다.
- 근거 묶음에 있는 사실만 씁니다. 묶음에 없는 원인 · 숫자 · 서버 이름은 지어내지 않습니다.
- 가장 급한 것부터 봅니다: 업무 영향(체결 · 시세 같은 업무 알림)과 그 원인 → 진행 중 장애 → 장애 위험도 → 서버 이상 → 실패 배치. 지금 진행 중인 것이 먼저이고, 이미 해소된 알림을 제목에 올리지 않습니다.
- 함수 점유율 증가는 원인 "후보"입니다. 단정하지 않습니다.
- 줄마다 그 줄의 근거 id를 붙입니다.
- 함께 주는 규칙 문장은 참고일 뿐입니다.
- JSON 객체 하나만 답합니다. 앞뒤에 설명 글을 붙이지 않습니다.

` + llm.Style + `

스키마:
{"headline": "...", "lines": [{"text": "...", "evidence_ids": ["..."]}], "next_checks": ["..."]}
- headline: 제목 한 줄, 30자 안(길어도 60자). "업무 + 증상" 꼴, 필요하면 " — 유발 요인". 수준 말(위험 · 경고)과 원인 함수 이름은 쓰지 않습니다(아이콘과 추정 원인 칸에 보입니다). 예: "중계 응답 지연 — 수신 급증"
- lines: 판단 1~2줄, 줄마다 50자 안(길어도 90자). 인과(유발 요인 → 원인 후보 → 증상), 영향 범위, 동시에 난 이상이 대표 이슈와 관련인지 별건인지, 무엇을 먼저 볼지를 씁니다. 알림 값 · 점유율 · 지표 수치는 되풀이하지 않습니다. evidence_ids는 근거 묶음 evidence[].id만 1~3개. 예: "수신 급증이 route_msg CPU를 밀어 올려 중계 큐 적체 — dw-02 메모리는 별건"
- next_checks: 지금 할 일 최대 2개, 항목마다 35자 안, "대상 + 볼 것 + 확인" 꼴. "지속 여부 확인", "추이 확인"처럼 지켜보라는 항목은 넣지 않습니다`

// tracePrompt는 추적 근거 묶음 요청이다(화면에서 그대로 보이지는 않는다).
func tracePrompt(t Trace, loc *time.Location) llm.Request {
	type packed struct {
		Alert    string         `json:"alert"`
		Subject  string         `json:"subject"`
		Evidence []packEvidence `json:"evidence"`
	}
	p := packed{Alert: fmt.Sprintf("%s · %s · %s 발생", levelText(t.Alert.Level), model.MaskSecrets(t.Alert.Message), clock(t.Alert.TS, loc)), Subject: t.subject()}
	var ids []string
	for _, e := range t.Evidence {
		p.Evidence = append(p.Evidence, packEvidence{ID: e.ID, Title: cut(model.MaskSecrets(e.Title), 200), Lines: maskLines(e.Lines)})
		ids = append(ids, e.ID)
	}
	body := packJSON(p)
	for len(body) > maxPrompt && len(p.Evidence) > 2 {
		p.Evidence = p.Evidence[:len(p.Evidence)-1]
		body = packJSON(p)
	}
	prompt := "다음은 알림 하나에서 원인 함수를 추적한 근거 묶음(JSON)입니다.\n" + body +
		"\n\n근거 ID: " + strings.Join(ids, ", ") + "\n규칙 판단(참고): " + t.Rule.Title + "\n"
	return llm.Request{System: traceSystem, Prompt: prompt, MaxTokens: traceMaxTokens, Temperature: 0}
}

func briefPrompt(rule Brief, p briefPack) llm.Request {
	body := packJSON(p)
	for len(body) > maxPrompt && len(p.Evidence) > 2 {
		p.Evidence = p.Evidence[:len(p.Evidence)-1]
		body = packJSON(p)
	}
	var r strings.Builder
	r.WriteString(model.MaskSecrets(rule.Headline) + "\n") // 로그 알림 문구에는 로그 줄 원문이 들어 있다
	for _, l := range rule.Lines {
		r.WriteString("- " + model.MaskSecrets(l.Text) + " [" + strings.Join(l.Refs, ", ") + "]\n")
	}
	prompt := "다음은 지금 상황의 근거 묶음(JSON)입니다.\n" + body + "\n\n규칙 문장(참고):\n" + r.String()
	return llm.Request{System: briefSystem, Prompt: prompt, MaxTokens: briefMaxTokens, Temperature: 0}
}

func maskLines(in []string) []string {
	out := make([]string, 0, len(in))
	for _, l := range in {
		out = append(out, cut(model.MaskSecrets(l), 300))
	}
	return out
}

func packJSON(v any) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", " ")
	if err := enc.Encode(v); err != nil {
		return "{}"
	}
	return strings.TrimRight(b.String(), "\n")
}

// askTraceLLM은 추적 근거를 LLM에 보내 초안을 받는다. 답이 계약에 맞지 않으면 에러(호출자는 규칙 판단을 쓴다).
func askTraceLLM(ctx context.Context, l llm.LLM, t Trace, loc *time.Location) (Diagnosis, error) {
	if l == nil || l.Name() == "none" {
		return Diagnosis{}, llm.ErrNotConfigured
	}
	out, err := l.Complete(ctx, tracePrompt(t, loc))
	if err != nil {
		return Diagnosis{}, fmt.Errorf("llm %s: %w", l.Name(), err)
	}
	d, err := parseTrace(out, t.Evidence)
	if err != nil {
		return Diagnosis{}, err
	}
	d.By, d.Model = "llm", l.Name()
	return d, nil
}

func parseTrace(out string, ev []Evidence) (Diagnosis, error) {
	var a struct {
		Title       string   `json:"title"`
		Detail      string   `json:"detail"`
		Confidence  string   `json:"confidence"`
		EvidenceIDs []string `json:"evidence_ids"`
		NextChecks  []string `json:"next_checks"`
	}
	if err := json.Unmarshal([]byte(unfence(out)), &a); err != nil {
		return Diagnosis{}, fmt.Errorf("llm 답이 JSON 하나가 아닙니다: %v (%.80q)", err, out)
	}
	title := strings.TrimSpace(a.Title)
	switch n := utf8.RuneCountInString(title); {
	case n == 0:
		return Diagnosis{}, fmt.Errorf("llm 답의 title이 비었습니다")
	case n > maxTraceTitle:
		return Diagnosis{}, fmt.Errorf("llm 답의 title이 %d자를 넘습니다(%d자)", maxTraceTitle, n)
	}
	conf := strings.ToLower(strings.TrimSpace(a.Confidence))
	if conf != "high" && conf != "medium" && conf != "low" {
		return Diagnosis{}, fmt.Errorf("llm 답의 confidence %q는 high·medium·low가 아닙니다", a.Confidence)
	}
	ids, err := checkIDs(a.EvidenceIDs, ev)
	if err != nil {
		return Diagnosis{}, err
	}
	return Diagnosis{Title: title, Detail: cut(strings.TrimSpace(a.Detail), maxDetail), Confidence: conf, EvidenceIDs: ids[:min(len(ids), maxCite)],
		NextChecks: cleanChecks(a.NextChecks, maxChecks)}, nil
}

// askBriefLLM은 브리핑 근거를 LLM에 보내 문장을 받는다. 답이 계약에 맞지 않으면 에러.
func askBriefLLM(ctx context.Context, l llm.LLM, rule Brief, p briefPack) (Brief, error) {
	if l == nil || l.Name() == "none" {
		return Brief{}, llm.ErrNotConfigured
	}
	out, err := l.Complete(ctx, briefPrompt(rule, p))
	if err != nil {
		return Brief{}, fmt.Errorf("llm %s: %w", l.Name(), err)
	}
	b, err := parseBrief(out, rule.Evidence)
	if err != nil {
		return Brief{}, err
	}
	b.By, b.Model = "llm", l.Name()
	return b, nil
}

func parseBrief(out string, ev []Evidence) (Brief, error) {
	var a struct {
		Headline string `json:"headline"`
		Lines    []struct {
			Text        string   `json:"text"`
			EvidenceIDs []string `json:"evidence_ids"`
		} `json:"lines"`
		NextChecks []string `json:"next_checks"`
	}
	if err := json.Unmarshal([]byte(unfence(out)), &a); err != nil {
		return Brief{}, fmt.Errorf("llm 답이 JSON 하나가 아닙니다: %v (%.80q)", err, out)
	}
	h := strings.TrimSpace(a.Headline)
	switch n := utf8.RuneCountInString(h); {
	case n == 0:
		return Brief{}, fmt.Errorf("llm 답의 headline이 비었습니다")
	case n > maxHeadline:
		return Brief{}, fmt.Errorf("llm 답의 headline이 %d자를 넘습니다(%d자)", maxHeadline, n)
	}
	if len(a.Lines) == 0 || len(a.Lines) > maxLines {
		return Brief{}, fmt.Errorf("llm 답의 lines는 1~%d줄이어야 합니다(%d줄)", maxLines, len(a.Lines))
	}
	b := Brief{Headline: h, Lines: []Line{}, NextChecks: cleanChecks(a.NextChecks, maxBriefChecks)}
	for i, l := range a.Lines {
		text := strings.TrimSpace(l.Text)
		switch n := utf8.RuneCountInString(text); {
		case n == 0:
			return Brief{}, fmt.Errorf("llm 답의 lines[%d]가 비었습니다", i)
		case n > maxLine:
			return Brief{}, fmt.Errorf("llm 답의 lines[%d]가 %d자를 넘습니다(%d자)", i, maxLine, n)
		}
		ids, err := checkIDs(l.EvidenceIDs, ev)
		if err != nil {
			return Brief{}, fmt.Errorf("lines[%d]: %w", i, err)
		}
		ids = ids[:min(len(ids), maxCite)]
		b.Lines = append(b.Lines, Line{Text: text, Refs: ids, Level: lineLevel(ids, ev)})
	}
	return b, nil
}

// lineLevel은 줄 근거 중 알림의 가장 높은 수준이다(화면 줄 표시).
func lineLevel(ids []string, ev []Evidence) string {
	best := ""
	for _, id := range ids {
		for _, e := range ev {
			if e.ID == id && e.Alert != nil && lvl(e.Alert.Level) > lvl(best) {
				best = e.Alert.Level
			}
		}
	}
	return best
}

// checkIDs는 근거 ID가 모두 묶음에 있고 하나 이상인지 본다(중복·빈 ID는 버린다).
func checkIDs(in []string, ev []Evidence) ([]string, error) {
	known := map[string]bool{}
	for _, e := range ev {
		known[e.ID] = true
	}
	ids, missing, seen := []string{}, []string{}, map[string]bool{}
	for _, id := range in {
		if id = strings.TrimSpace(id); id == "" || seen[id] {
			continue
		}
		seen[id] = true
		if !known[id] {
			missing = append(missing, id)
			continue
		}
		ids = append(ids, id)
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("근거에 없는 ID: %s", strings.Join(missing, ", "))
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("evidence_ids가 비었습니다")
	}
	return ids, nil
}

func cleanChecks(in []string, n int) []string {
	out := []string{}
	for _, c := range in {
		if c = strings.TrimSpace(c); c != "" && len(out) < n {
			out = append(out, cut(c, maxCheckLen))
		}
	}
	return out
}
