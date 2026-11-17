#!/bin/sh
# 화면 확인 도구. 워크트리 뿌리에서 실행한다.
#   sh docs/ui-hardening/tools/check.sh <포트> [작업.json]
# mock 미리보기를 빌드해 띄우고 headless chrome으로 화면마다 콘솔 오류를 찍고 .run/shots/에 스크린샷을 남긴다.
# 환경 변수: W H(창 크기, 기본 1440x1500) THEME(light|dark) SEARCH(예: '?fail=/hosts')
# 띄운 서버·브라우저는 PID로만 끈다(pkill -f 금지: 다른 세션 것까지 죽는다).
set -eu
port=${1:?포트 번호를 주세요}
jobs=${2:-docs/ui-hardening/tools/routes.json}
root=$(git rev-parse --show-toplevel)
cd "$root"
node=${NODE:-$HOME/.local/eum-tools/node/bin/node}
sh deploy/ui_preview.sh >/dev/null
sed -i "s|llm: get('llm') === '1',|llm: get('llm') !== '0',|" .run/ui-preview/mock/index.js
mkdir -p .run/shots
(cd .run/ui-preview && exec python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1) &
hp=$!
cport=$((port + 1000))
google-chrome --headless=new --remote-debugging-port="$cport" --user-data-dir="$root/.run/chrome-$port" \
  --no-first-run --hide-scrollbars about:blank >/dev/null 2>&1 &
cp=$!
trap 'kill $hp $cp 2>/dev/null || true' EXIT
sleep 2
PORT=$port CPORT=$cport OUT="$root/.run/shots" "$node" docs/ui-hardening/tools/cdp.mjs "$jobs"
