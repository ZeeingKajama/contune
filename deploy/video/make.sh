#!/bin/sh
# 부스 소개 영상 만들기: 써밋 시연판 빌드 → 촬영(record.js) → 잇기(compose.py).
# 결과: .run/video/eum-booth.mp4 (1920×1080 · 30fps · 약 2분 17초)
# 글 · 순서는 deploy/video/shots.js, 자막 · 카드 모양은 deploy/video/director.html.
# 필요: node + Playwright(Chromium), python3 + Pillow, ffmpeg, 한글 글꼴(Pretendard 권장).
set -eu
cd "$(dirname "$0")/../.."
deploy/summit_demo.sh
node deploy/video/record.js .run/video
python3 deploy/video/compose.py .run/video
