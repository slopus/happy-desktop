#!/bin/bash
# The cut's backdrop: the App Store videos' hero shader (backdrop-shader.mjs, the store tour's
# shader-search.mjs) at 1920x1080, 30 fps, speed 0.35, the glow centred, 1140 frames with the
# last second dissolved into the first, so 1110 frames (37 s) loop seamlessly. CPU only.
#   bash make-backdrop.sh <out.mp4>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
work="$(dirname "$out")/.backdrop"
mkdir -p "$work"
E="-c:v libx264 -preset fast -crf 6 -pix_fmt yuv444p"
total=1140
chunks=12
size=$(((total + chunks - 1) / chunks))
for c in $(seq 0 $((chunks - 1))); do
    a=$((c * size)); b=$(((c + 1) * size)); [ $b -gt $total ] && b=$total
    node "$here/backdrop-shader.mjs" 1920 1080 30 0.35 1024 0.5 0.5 $a $b |
        ffmpeg -v error -y -f rawvideo -pix_fmt rgb24 -s 1920x1080 -r 30 -i - $E "$work/c$c.mp4" &
done
wait
for c in $(seq 0 $((chunks - 1))); do echo "file '$work/c$c.mp4'"; done > "$work/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$work/list.txt" -filter_complex \
    "[0:v]split=3[x][y][z];[x]trim=start_frame=1110:end_frame=1140,setpts=PTS-STARTPTS,format=gbrp[t];[y]trim=start_frame=0:end_frame=30,setpts=PTS-STARTPTS,format=gbrp[h];[t][h]blend=all_expr='A*(1-N/30)+B*(N/30)',format=yuv444p[m];[z]trim=start_frame=30:end_frame=1110,setpts=PTS-STARTPTS[r];[m][r]concat=n=2:v=1[out]" \
    -map "[out]" $E "$out"
