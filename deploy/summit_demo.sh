#!/bin/sh
# 써밋 시연판 빌드. 화면 정적 파일을 .run/summit-demo/로 복사하고
# mock 고정 + summit 프로필 고정(서버 46대 · 플로우 41개 · 줄거리 전부 · 발표자용 순서 가이드)으로 만든다.
# 저장소 원본은 건드리지 않는다. 산출물은 백엔드 없이 뜨는 정적 사이트다:
#   claude.ai 아티팩트  페이지 .run/summit-demo/index.html, files 맵 .run/summit-demo.files.json (index.html을 뺀 나머지)
#   아무 웹 서버        .run/summit-demo/ 폴더를 그대로 올린다(예: python3 -m http.server 8091 -d .run/summit-demo)
# 심사위원용 체험판(lite 프로필)은 deploy/judge_demo.sh, 팀 리뷰용 미리보기(full 프로필)는 deploy/ui_preview.sh.
set -eu
cd "$(dirname "$0")/.."
src=internal/manager/web/static
out=.run/summit-demo
map=.run/summit-demo.files.json

rm -rf "$out"
mkdir -p "$out"
cp -R "$src"/. "$out"/

# isMock()이 항상 true를 돌려주게 한다.
sed -i 's|^export function isMock() {$|&\n  return true; // 시연판 빌드: 항상 mock|' "$out/api.js"
grep -q '시연판 빌드: 항상 mock' "$out/api.js" || {
  echo "api.js에서 'export function isMock() {' 줄을 찾지 못함" >&2
  exit 1
}

# 프로필을 summit으로 고정한다(주소에 쿼리를 붙일 수 없는 곳에서도 시연판으로 뜨게).
sed -i "s|^const FIXED = '';|const FIXED = 'summit';|" "$out/mock/profile.js"
grep -q "^const FIXED = 'summit';" "$out/mock/profile.js" || {
  echo "mock/profile.js에서 \"const FIXED = '';\" 줄을 찾지 못함" >&2
  exit 1
}

# 탭·갤러리에 보일 이름
sed -i 's|<title>이음</title>|<title>이음 써밋 시연판</title>|' "$out/index.html"
grep -q '<title>이음 써밋 시연판</title>' "$out/index.html" || {
  echo "index.html에서 <title>이음</title> 줄을 찾지 못함" >&2
  exit 1
}

# 순서 가이드 파일이 빠지면 시연판이 아니다.
for f in guide/stage.js guide/summit.js css/stage.css; do
  [ -f "$out/$f" ] || { echo "$f 가 없음" >&2; exit 1; }
done

# 확장자로 형식을 알 수 없는 파일(vendor/LICENSE 등)은 text/plain으로 올린다.
(cd "$out" && find . -type f ! -path ./index.html | sed 's|^\./||' | sort) | awk '
  BEGIN { printf "{" }
  {
    if (NR > 1) printf ", "
    if ($0 ~ /\.(js|css|json|svg|png|jpg|gif|webp|woff2?|ttf)$/) printf "\"%s\": \"%s\"", $0, $0
    else printf "\"%s\": {\"from\": \"%s\", \"contentType\": \"text/plain\"}", $0, $0
  }
  END { print "}" }' > "$map"

n=$(find "$out" -type f | wc -l)
echo "OK: $out (파일 ${n}개, mock · summit 고정), files 맵 $map"
