#!/usr/bin/env python3
"""record.js가 남긴 프레임(frames.json)과 구간(segments.json)을 30fps 영상 하나로 잇는다.

구간마다 그 시각의 프레임을 30fps로 뽑고, 이음새는 짧은 디졸브(기본 8프레임)로 겹친다.
결과: <폴더>/eum-booth.mp4 (1920×1080, H.264, 무음 트랙 포함: 소리 없는 파일을 못 트는 TV가 있다)
  사용: python3 deploy/video/compose.py [폴더(기본 .run/video)]
필요: Pillow, ffmpeg
"""
import bisect
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

FPS = 30
XF = 8  # 디졸브 프레임 수

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, '.run', 'video'))
frames = json.load(open(os.path.join(out, 'frames.json'), encoding='utf-8'))
segs = json.load(open(os.path.join(out, 'segments.json'), encoding='utf-8'))
fdir = os.path.join(out, 'frames')
ts = [f['t'] for f in frames]


def at(t):
    i = bisect.bisect_right(ts, t) - 1
    return os.path.join(fdir, frames[max(i, 0)]['f'])


clips = []
for s in segs:
    n = max(1, round((s['b'] - s['a']) * FPS))
    clips.append([at(s['a'] + k / FPS) for k in range(n)])

seq = []
for i, c in enumerate(clips):
    if not seq:
        seq.extend(c)
        continue
    # 카드에서 카드로는 디졸브 없이 끊는다(글자끼리 겹쳐 보인다). 카드 글자는 스스로 떠오른다.
    both_cards = segs[i - 1]['name'].startswith('c-') and segs[i]['name'].startswith('c-')
    xf = 0 if both_cards else min(XF, len(c) // 3, len(seq) // 3)
    tail = seq[len(seq) - xf:] if xf else []
    del seq[len(seq) - xf:]
    for k in range(xf):
        seq.append(('blend', tail[k], c[k], (k + 1) / (xf + 1)))
    seq.extend(c[xf:])

cache = {}


def img(e):
    if isinstance(e, tuple):
        _, p, q, al = e
        return Image.blend(img(p), img(q), al)
    if e not in cache:
        if len(cache) > 64:
            cache.clear()
        cache[e] = Image.open(e).convert('RGB')
    return cache[e]


sdir = os.path.join(out, 'seq')
shutil.rmtree(sdir, ignore_errors=True)
os.makedirs(sdir)
for i, e in enumerate(seq):
    dst = os.path.join(sdir, f'{i:06d}.jpg')
    if isinstance(e, tuple):
        img(e).save(dst, quality=95)
    else:
        os.symlink(e, dst)

mp4 = os.path.join(out, 'eum-booth.mp4')
cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(sdir, '%06d.jpg'),
       '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest',
       '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
       '-profile:v', 'high', '-r', str(FPS), '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', mp4]
subprocess.run(cmd, check=True)
print(f'{mp4}: {len(seq)}프레임 = {len(seq) / FPS:.1f}초, 구간 {len(segs)}개')
