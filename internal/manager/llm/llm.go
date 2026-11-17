// Package llm은 언어 모델 연결 확장 지점이다(05 §9, §12). 기본 구현은 none(연결 안 됨).
package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
)

// LLM은 언어 모델 하나다.
type LLM interface {
	Name() string
	Complete(ctx context.Context, req Request) (string, error)
}

// Request는 완성 요청이다.
type Request struct {
	System      string
	Prompt      string
	MaxTokens   int
	Temperature float64
}

// Tool은 LLM이 부를 수 있는 도구 하나다(카드 Q). 읽기 전용 일에만 쓴다.
type Tool struct {
	Name        string
	Description string
	Schema      map[string]any // 입력 JSON Schema(type: object, properties, required)
	Run         func(ctx context.Context, input json.RawMessage) (string, error)
}

// ToolLLM은 도구를 부르며 답하는 LLM이다. 선택 구현이라 l.(ToolLLM)으로 알아본다(05 §12의 인터페이스 8개 밖).
type ToolLLM interface {
	LLM
	// CompleteTools는 LLM이 도구를 부르면 Run을 돌려 결과를 돌려주기를 되풀이하고(LLM 호출 최대 maxSteps번),
	// 도구를 더 부르지 않는 마지막 답의 글을 돌려준다. Run의 에러는 LLM에 오류 결과로 돌려준다(끝내지 않는다).
	// maxSteps를 다 쓰면 에러.
	CompleteTools(ctx context.Context, req Request, tools []Tool, maxSteps int) (string, error)
}

// Style은 화면에 그대로 걸릴 글을 LLM에 쓰게 할 때 System에 붙이는 말투 안내다(관제 AI 브리핑·원인 추적, 종료 보고서 분석).
// LLM은 그냥 두면 "~한 것으로 보입니다" 같은 풀어 쓴 설명문으로 답한다. 말투와 용어집은 여기 한 곳에서 고친다.
const Style = `말투: 답의 글은 운영 화면에 그대로 걸리고, 운영자는 장애 대응 중에 훑어 읽습니다. 보고서 문장이 아니라 상황판 표기로 씁니다.
- 명사구나 "~함", "~됨", "~임"으로 끝냅니다. "~습니다"로 끝내지 않습니다. 조사와 접속어는 뜻이 통하는 한 뺍니다. 예: "p99 80ms(경고 50) · 1분 경과"
- 한 줄에 사실 하나만 담습니다. 수치·단위·이름은 받은 그대로 씁니다.
- 같은 수치는 답 전체에서 한 번만 씁니다.
- 인사와 맺음말, "분석 결과"나 "근거를 보면" 같은 머리말, 앞 줄을 다른 말로 되풀이하는 줄은 넣지 않습니다.
- 모르는 것은 무엇을 모르는지 한 번만 적습니다. 줄마다 "~로 보임", "~일 수 있음"을 붙이지 않습니다.
용어: 운영·APM 현장 용어로 씁니다. 풀어 쓴 말 대신 다음 표기를 씁니다.
- 프로파일 샘플, Self CPU 점유율(줄여서 점유율), 콜스택, 기준 구간(A)·이상 구간(B), 대상 프로세스, 발생·해소·경과, 임계치, 유입 TPS, 포화, 병목, 핫스팟, 락 경합, 재시도, 스로틀링`

// ErrNotConfigured는 LLM이 연결되지 않았을 때의 에러다.
var ErrNotConfigured = errors.New("llm not configured")

var (
	mu        sync.RWMutex
	factories = map[string]func(cfg map[string]any) (LLM, error){}
)

// Register는 종류 kind의 LLM을 등록한다. 같은 종류를 두 번 등록하면 panic.
func Register(kind string, f func(cfg map[string]any) (LLM, error)) {
	mu.Lock()
	defer mu.Unlock()
	if _, dup := factories[kind]; dup {
		panic("llm: " + kind + " 종류가 이미 등록됨")
	}
	factories[kind] = f
}

// Build는 cfg의 type으로 LLM을 만든다. cfg가 비었거나 type이 none이면 none 구현(nil 아님).
func Build(cfg map[string]any) (LLM, error) {
	kind, _ := cfg["type"].(string)
	if kind == "" || kind == "none" {
		return none{}, nil
	}
	mu.RLock()
	f, ok := factories[kind]
	mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("모르는 llm 종류 %q", kind)
	}
	return f(cfg)
}

// none은 연결되지 않은 LLM이다.
type none struct{}

func (none) Name() string { return "none" }
func (none) Complete(ctx context.Context, req Request) (string, error) {
	return "", ErrNotConfigured
}

var fence = regexp.MustCompile("(?s)```(?:ya?ml)?[ \\t]*\\n(.*?)```")

// SplitYAML은 답에서 ```yaml 블록(없으면 전체)과 블록 밖 설명의 첫 줄을 돌려준다(플로우·보드 초안이 같이 쓴다).
func SplitYAML(out string) (string, string) {
	m := fence.FindStringSubmatchIndex(out)
	if m == nil {
		return strings.TrimSpace(out), ""
	}
	y := strings.TrimSpace(out[m[2]:m[3]])
	rest := out[:m[0]] + "\n" + out[m[1]:]
	for _, ln := range strings.Split(rest, "\n") {
		if ln = strings.TrimSpace(ln); ln != "" {
			return y, ln
		}
	}
	return y, ""
}
