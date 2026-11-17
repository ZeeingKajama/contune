#!/bin/sh
# 심사위원용 체험판 빌드. 화면 정적 파일을 .run/judge-demo/로 복사하고
# mock 고정 + lite 프로필 고정(서버 9대 · 플로우 7개 · 줄거리 하나 · 화면 위 가이드)으로 만든다.
# 저장소 원본은 건드리지 않는다. 산출물은 백엔드 없이 뜨는 정적 사이트다:
#   claude.ai 아티팩트  페이지 .run/judge-demo/index.html, files 맵 .run/judge-demo.files.json (index.html을 뺀 나머지)
#   아무 웹 서버        .run/judge-demo/ 폴더를 그대로 올린다(예: python3 -m http.server 8090 -d .run/judge-demo)
# 팀 리뷰용 미리보기(full 프로필)는 deploy/ui_preview.sh.
set -eu
cd "$(dirname "$0")/.."
src=internal/manager/web/static
out=.run/judge-demo
map=.run/judge-demo.files.json

rm -rf "$out"
mkdir -p "$out"
cp -R "$src"/. "$out"/

# isMock()이 항상 true를 돌려주게 한다.
sed -i 's|^export function isMock() {$|&\n  return true; // 체험판 빌드: 항상 mock|' "$out/api.js"
grep -q '체험판 빌드: 항상 mock' "$out/api.js" || {
  echo "api.js에서 'export function isMock() {' 줄을 찾지 못함" >&2
  exit 1
}

# 프로필을 lite로 고정한다(주소에 쿼리를 붙일 수 없는 곳에서도 체험판으로 뜨게).
sed -i "s|^const FIXED = '';|const FIXED = 'lite';|" "$out/mock/profile.js"
grep -q "^const FIXED = 'lite';" "$out/mock/profile.js" || {
  echo "mock/profile.js에서 \"const FIXED = '';\" 줄을 찾지 못함" >&2
  exit 1
}

# 탭·갤러리에 보일 이름
sed -i 's|<title>이음</title>|<title>이음 체험판</title>|' "$out/index.html"
grep -q '<title>이음 체험판</title>' "$out/index.html" || {
  echo "index.html에서 <title>이음</title> 줄을 찾지 못함" >&2
  exit 1
}

# 가이드 파일이 빠지면 체험판이 아니다.
for f in guide/guide.js guide/tours.js css/guide.css; do
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
echo "OK: $out (파일 ${n}개, mock · lite 고정), files 맵 $map"
