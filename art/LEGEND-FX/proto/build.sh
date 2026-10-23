#!/bin/bash
# 使い方: ./build.sh <frames のフォルダ名> <出す名前>  → ../<名前>.gif と ../<名前>-slow.gif（2 パスで パレット作り）
set -e; cd "$(dirname "$0")"
F=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc
mk(){ # fps label out
  ffmpeg -y -loglevel error -framerate $1 -i ${FR:-frames}/$2/%04d.png -vf "scale=${W}:-1:flags=lanczos,drawtext=fontfile=$F:text='$3':fontcolor=white:fontsize=14:x=(w-text_w)/2:y=h-20,split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" -loop 0 ${OUT:-..}/$4.gif
}
W=${W:-900}
mk 50 $1 'ふつうの はやさ' $2
mk 12.5 $1 '4ばい おそい' $2-slow
ls -la ${OUT:-..}/$2.gif ${OUT:-..}/$2-slow.gif
