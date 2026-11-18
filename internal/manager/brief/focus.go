package brief

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"eum/internal/model"
)

// 브리핑 화면 구조(2026-11-18). 문장 몇 줄로는 같은 사실(알림 값 · 원인 함수 · 유입 배수)이 머리글 · 줄 · 원인 칸에
// 되풀이돼 읽기 어려웠다. 규칙이 대표 이슈 하나를 골라 현상(Symptoms) · 추정 원인(Brief.Trace) · 권장 조치(NextChecks)로
// 나누고, 나머지 진행 중 이상은 기타 이슈(Others)로 한 번씩만 쓴다. 칸은 근거에서 바로 만들므로 LLM이 있어도 같고,
// LLM은 제목(Headline)과 칸들을 이어 읽는 판단(Lines)만 쓴다. Lines는 LLM 참고 문장과 이전 화면을 위해 그대로 둔다.

// Symptom은 대표 이슈의 현상 한 줄이다: 지표 · 현재 값 · 기준.
type Symptom struct {
	Label string   `json:"label"`           // 지표 이름: "대기 큐", "p99 응답 시간", "오류 로그"
	Value string   `json:"value"`           // 현재 값: "2,240건", "값 끊김 45초"
	Limit string   `json:"limit,omitempty"` // 기준: "임계 2,000", "하한 10,000", "기준 30초"
	Host  string   `json:"host,omitempty"`
	Level string   `json:"level"`
	Refs  []string `json:"refs"`
}

// Focus는 브리핑의 대표 이슈다(가장 급한 업무 알림 묶음).
type Focus struct {
	Title    string    `json:"title"` // "체결 응답 지연": 수준 말과 원인 함수는 쓰지 않는다(화면이 아이콘과 추정 원인 칸으로 보인다)
	Level    string    `json:"level"`
	Since    int64     `json:"since"` // 묶음에서 가장 먼저 열린 알림 시각
	Hosts    []string  `json:"hosts"`
	Symptoms []Symptom `json:"symptoms"`
	Traced   bool      `json:"traced"`             // Brief.Trace가 이 이슈의 원인 분석이다
	Incident *Incident `json:"incident,omitempty"` // 이 이슈로 열린 진행 중 장애 기록(기타 이슈에 따로 쓰지 않는다)
}

// Incident는 대표 이슈에 걸린 진행 중 장애 기록이다.
type Incident struct {
	Ref   string `json:"ref"` // 근거 ID(incident:n)
	Title string `json:"title"`
	Start int64  `json:"start"`
}

const (
	maxSymptoms   = 5
	maxOthers     = 8
	maxOtherHosts = 4
)

// plainSignal은 제목 말이다: signalWord에서 수준 말을 뺀 것("응답 지연(위험)" → "응답 지연").
func plainSignal(signal string) string {
	w := signalWord(signal, "")
	if i := strings.LastIndex(w, "("); i > 0 {
		w = w[:i]
	}
	return w
}

// tileMsgRe는 타일 알림 문구(alert.tileMessage, 05 §18)에서 패널 머리를 뺀 것을 가른다:
//
//	"대기 큐 2,240건 (위험 2,000)" · "1분 시세량 30,000건/분 · feed-03 (경고 하한 60,000)" · "1분 시세량 값 끊김 45초 · feed-01 (기준 30초)"
var tileMsgRe = regexp.MustCompile(`^(.+?) (값 끊김 \S+|-?[0-9][0-9,.]*\S*)(?: · (\S+))? \(([^)]*)\)$`)

// limitText는 "(위험 2,000)"의 기준을 "임계 2,000"으로 쓴다. 수준은 아이콘이 보이므로 말에서 뺀다.
func limitText(s string) string {
	s = strings.TrimSpace(s)
	for _, p := range []string{"위험 ", "경고 "} {
		if rest, ok := strings.CutPrefix(s, p); ok {
			if strings.HasPrefix(rest, "하한 ") {
				return rest
			}
			return "임계 " + rest
		}
	}
	return s
}

// symptomOf는 알림 하나를 현상 한 줄로 쓴다. 문구 꼴을 모르면 알림 이름과 짧은 문구를 그대로 쓴다.
func symptomOf(a model.Alert, ref string) Symptom {
	s := Symptom{Host: a.Host, Level: a.Level, Refs: []string{ref}}
	short := alertShort(a)
	switch a.Kind {
	case "tile":
		if m := tileMsgRe.FindStringSubmatch(short); m != nil {
			s.Label, s.Value, s.Limit = m[1], m[2], limitText(m[4])
			if m[3] != "" {
				s.Host = m[3]
			}
			return s
		}
	case "log":
		// "(E) 24건 · 첫 줄" → 오류 로그 24건(출처)
		s.Label = "오류 로그"
		if a.Name != "" {
			s.Label += "(" + a.Name + ")"
		}
		s.Value = fmt.Sprintf("%s건", num(a.Value))
		return s
	case "host":
		// "match-01 CPU 사용률 ≥ 70%"(alertShort) → match-01 · CPU 사용률 ≥ 70%
		s.Label = a.Host
		s.Value = strings.TrimSpace(strings.TrimPrefix(short, a.Host))
		return s
	case "service":
		// "체결(match-01) 서비스 미기동: 살아 있는 프로세스 0 / 1" → 서비스 미기동 · 살아 있는 프로세스 0 / 1
		if _, why, ok := strings.Cut(short, ": "); ok {
			s.Label, s.Value = "서비스 미기동", why
			return s
		}
	}
	s.Label, s.Value = alertLabel(a), short
	if s.Label == s.Value {
		s.Label = kindText(a.Kind)
	}
	return s
}

// chipText는 기타 이슈 칩에 묶음 이름 뒤로 붙는 짧은 말이다(묶음 이름과 겹치는 말은 뺀다):
// 지표는 "RT p99 385ms", 서비스 중단은 서버, 오류 로그는 건수.
func chipText(a model.Alert) string {
	s := symptomOf(a, "")
	switch a.Kind {
	case "service":
		return orDash(a.Host)
	case "log":
		return s.Value
	case "tile":
		if s.Label != kindText(a.Kind) {
			t := s.Label + " " + s.Value
			if s.Host != "" {
				t += " · " + s.Host
			}
			return t
		}
	}
	return alertShort(a)
}

// focusOf는 업무 알림 묶음 하나를 대표 이슈로 쓴다. related는 이 이슈의 서버에서 난 서버 알림(현상에 함께 쓴다).
// ref는 알림의 근거 ID를 돌려준다(근거 묶음에 넣는다).
func focusOf(title, signal string, alerts, related []model.Alert, traceHost string, traced bool, ref func(model.Alert) string) *Focus {
	f := &Focus{Title: title + " " + plainSignal(signal), Level: "ok", Hosts: []string{}, Symptoms: []Symptom{}, Traced: traced}
	hosts := map[string]bool{}
	addHost := func(h string) {
		if h != "" && !hosts[h] {
			hosts[h] = true
			f.Hosts = append(f.Hosts, h)
		}
	}
	all := append(append([]model.Alert(nil), alerts...), related...)
	// 심한 것부터, 같은 수준이면 업무 지표 → 서비스 → 로그 → 서버 순(업무 영향이 먼저 읽히게)
	sort.SliceStable(all, func(i, j int) bool {
		if li, lj := lvl(all[i].Level), lvl(all[j].Level); li != lj {
			return li > lj
		}
		return symptomRank[all[i].Kind] < symptomRank[all[j].Kind]
	})
	for _, a := range all {
		if lvl(a.Level) > lvl(f.Level) {
			f.Level = a.Level
		}
		if f.Since == 0 || a.TS < f.Since {
			f.Since = a.TS
		}
		if a.Kind != "host" {
			addHost(a.Host)
		}
		if len(f.Symptoms) < maxSymptoms {
			f.Symptoms = append(f.Symptoms, symptomOf(a, ref(a)))
		}
	}
	if traced {
		addHost(traceHost)
	}
	sort.Strings(f.Hosts)
	return f
}

var symptomRank = map[string]int{"tile": 0, "service": 1, "log": 2, "host": 3}

// relatedHost는 대표 이슈의 서버인지다: 묶음 알림의 서버이거나 원인 분석이 따라간 서버.
func relatedHost(h string, alerts []model.Alert, traceHost string) bool {
	if h == "" {
		return false
	}
	if h == traceHost {
		return true
	}
	for _, a := range alerts {
		if a.Host == h {
			return true
		}
	}
	return false
}

// relatedIncident는 진행 중 장애가 대표 이슈의 것인지다: 범위가 이슈 알림의 그룹을 덮거나, 자동 기록 제목이 이슈의 업무로 시작한다
// ("자동: 체결 · 대기 큐 2,240건 (위험 2,000)").
func relatedIncident(in model.Incident, title string, alerts []model.Alert) bool {
	if in.Scope != "" {
		for _, a := range alerts {
			if a.Group != "" && inGroup(a.Group, in.Scope) {
				return true
			}
		}
	}
	t := strings.TrimPrefix(in.Title, "자동: ")
	return title != "" && strings.HasPrefix(t, title+" · ")
}

// focusChecks는 원인 분석(함수 비교)이 없는 대표 이슈의 권장 조치다: 신호별로 먼저 볼 곳.
func focusChecks(signal, title string, a model.Alert) []string {
	where := strings.TrimSpace(a.Host + " " + title)
	switch signal {
	case "down":
		return []string{where + " 서비스의 마지막 종료 보고서 · 기동 실행 확인", "기동 배치(플로우) 실패 · 대기 여부 확인"}
	case "log": // 묶음 이름이 이미 "match-01 오류 로그"
		return []string{title + " 원문과 첫 발생 시각 확인", "동시간대 배포 · 운영자 조작 여부 확인"}
	}
	return []string{title + " 업무 패널에서 임계 초과 지표의 서버 · 서비스 확인", "동시간대 서버 CPU · 디스크 · 네트워크, 외부 호출 대기 확인"}
}

// briefTitle은 대표 이슈가 없을 때의 화면 제목이다(수준은 아이콘이 보인다). nLive는 진행 중 이슈 줄 수(서버 이상뿐이면 대수).
// 진행 중인 것이 있으면 최근 해소를 제목에 올리지 않는다.
func briefTitle(nLive int, hostsOnly bool, nGone, nInc int, riskHot bool) string {
	switch {
	case nInc > 0:
		return fmt.Sprintf("진행 중 장애 %d건", nInc)
	case nLive > 0 && hostsOnly:
		return fmt.Sprintf("서버 이상 %d대", nLive)
	case riskHot && nLive == 1:
		return "장애 위험 지수 상승"
	case nLive > 0:
		return fmt.Sprintf("진행 중 이슈 %d건", nLive)
	case nGone > 0:
		return fmt.Sprintf("현재 정상 — 최근 10분 업무 알림 %d건 해소", nGone)
	}
	return "전체 정상"
}

// compactAlert는 목록 한 줄 · 칩에 쓰는 짧은 말이다: "대기 큐 2,240건", "match-01 오류 로그 24건", "feed-01 서비스 미기동".
func compactAlert(a model.Alert) string {
	s := symptomOf(a, "")
	switch a.Kind {
	case "tile":
		if s.Label != kindText(a.Kind) {
			return s.Label + " " + s.Value
		}
	case "log":
		return strings.TrimSpace(a.Host + " 오류 로그 " + s.Value)
	case "service":
		return strings.TrimSpace(a.Host + " 서비스 미기동")
	}
	return cut(alertShort(a), 40)
}
