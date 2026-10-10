#!/bin/bash
set -e
cd "$(dirname "$0")"
FONT=${FONT:-/System/Library/Fonts/Supplemental/Arial.ttf}
S=360
label() { echo "scale=$S:$S,setsar=1,drawtext=fontfile=$FONT:text='$1':x=10:y=h-30:fontsize=20:fontcolor=0x453824:box=1:boxcolor=0xf6f2e9@0.85:boxborderw=6"; }
clips=(01-finger-heart-motion 02-wave-motion-v2 03-crossed-fingers-motion 04-thumbs-up-motion-v2 05-holding-heart-motion 06-beckoning-motion 07-finger-dance-motion 08-turnaround-back-motion-v2 09-back-stop-motion-v2 10-back-middle-finger-motion-v4)
labels=("01 Finger heart" "02 Wave - redo" "03 Crossed fingers" "04 Thumbs up - redo" "05 Holding heart" "06 Beckoning" "07 Finger dance" "08 Turn to back - redo" "09 Stop - redo" "10 Middle finger - redo")
inputs=(); f=""; layout=""; streams=""
for i in {0..9}; do inputs+=(-stream_loop 2 -i videos/${clips[$i]}.mp4); f+="[$i:v]$(label "${labels[$i]}")[v$i];"; layout+="$(( (i%5)*S ))_$(( (i/5)*S ))|"; streams+="[v$i]"; done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${f}${streams}xstack=inputs=10:layout=${layout%|}[out]" -map "[out]" -c:v libx264 -pix_fmt yuv420p -crf 20 -an previews/all-ten-motions-v4.mp4
ffmpeg -loglevel error -y -ss 1 -i previews/all-ten-motions-v4.mp4 -frames:v 1 review/all-ten-v4-still.jpg
