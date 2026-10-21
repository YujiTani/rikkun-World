#!/bin/sh
# sources.txt の 録音（CC0）を とって、render.py が 読む 形（48 kHz モノラル 16 bit）に する。リポジトリの 外の フォルダに 置く。
# 使い方: sh fetch_samples.sh <置く フォルダ>   → python3 -I render.py <置く フォルダ> <出す フォルダ>
set -e
OUT="$1"; mkdir -p "$OUT/raw"
grep -v '^#' "$(dirname "$0")/sources.txt" | while read -r url name; do
  curl -sSL -o "$OUT/raw/$name" "$url"
  ffmpeg -loglevel error -y -i "$OUT/raw/$name" -ac 1 -ar 48000 -c:a pcm_s16le "$OUT/$name"
done
