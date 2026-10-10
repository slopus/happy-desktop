#!/bin/bash
set -e
cd "$(dirname "$0")"
FONT=${FONT:-/System/Library/Fonts/Supplemental/Arial.ttf}
S=360
label() { echo "scale=$S:$S,setsar=1,drawtext=fontfile=$FONT:text='$1':x=10:y=h-30:fontsize=20:fontcolor=0x453824:box=1:boxcolor=0xf6f2e9@0.85:boxborderw=6"; }
clips=(01-finger-heart-motion 02-wave-motion-v2 03-crossed-fingers-motion 04-thumbs-up-motion-v2 05-holding-heart-motion 06-beckoning-motion 07-finger-dance-motion 08-turnaround-back-motion-v2 09-back-stop-motion-v2 10-back-middle-finger-motion)
labels=("01 Finger heart" "02 Wave - redo" "03 Crossed fingers" "04 Thumbs up - redo" "05 Holding heart" "06 Beckoning" "07 Finger dance" "08 Turn to back - redo" "09 Stop - redo" "10 Middle finger")
inputs=(); f=""; layout=""; streams=""
for i in {0..9}; do inputs+=(-stream_loop 2 -i videos/${clips[$i]}.mp4); f+="[$i:v]$(label "${labels[$i]}")[v$i];"; layout+="$(( (i%5)*S ))_$(( (i/5)*S ))|"; streams+="[v$i]"; done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${f}${streams}xstack=inputs=10:layout=${layout%|}[out]" -map "[out]" -c:v libx264 -pix_fmt yuv420p -crf 20 -an previews/all-ten-motions-v2.mp4
pairs=(02-wave 04-thumbs-up 09-back-stop 08-turnaround-back); names=("02 Wave" "04 Thumbs up" "09 Stop" "08 Turn to back")
inputs=(); f=""; layout=""; streams=""; n=0
for i in {0..3}; do
  inputs+=(-stream_loop 2 -i videos/${pairs[$i]}-motion.mp4 -stream_loop 2 -i videos/${pairs[$i]}-motion-v2.mp4)
  f+="[$n:v]$(label "${names[$i]} - before")[v$n];"; layout+="$((i*S))_0|"; streams+="[v$n]"; n=$((n+1))
  f+="[$n:v]$(label "${names[$i]} - after")[v$n];"; layout+="$((i*S))_${S}|"; streams+="[v$n]"; n=$((n+1))
done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${f}${streams}xstack=inputs=8:layout=${layout%|}[out]" -map "[out]" -c:v libx264 -pix_fmt yuv420p -crf 20 -an previews/redo-before-after.mp4
ffmpeg -loglevel error -y -ss 1 -i previews/all-ten-motions-v2.mp4 -frames:v 1 review/all-ten-v2-still.jpg
ls -la previews/all-ten-motions-v2.mp4 previews/redo-before-after.mp4
