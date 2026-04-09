#!/bin/bash
# Convert recorded mp4 clips to optimized GIFs
# Speeds up longer recordings to fit target duration
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VIDEO_DIR="$SCRIPT_DIR/gifs/videos"
TEMP_DIR="$SCRIPT_DIR/gifs/temp"
OUT_DIR="$SCRIPT_DIR/../assets/gifs"

mkdir -p "$TEMP_DIR" "$OUT_DIR"

convert_gif() {
  local name="$1"
  local src="$2"
  local max_duration="${3:-15}"
  local f="$VIDEO_DIR/${src}"
  [ -f "$f" ] || { echo "Skip: $f not found"; return; }

  local duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f")
  local dur_int=${duration%.*}

  # Calculate speedup factor if video is too long
  local speed="1"
  if [ "$dur_int" -gt "$max_duration" ]; then
    speed=$(awk "BEGIN { printf \"%.2f\", $duration / $max_duration }")
  fi

  echo "Converting: $name (${dur_int}s source, ${speed}x speed → ~${max_duration}s target)"

  # setpts for video speed, adjust fps accordingly
  local target_fps=$(awk "BEGIN { printf \"%d\", 15 * $speed }")
  [ "$target_fps" -gt 30 ] && target_fps=30

  ffmpeg -y -i "$f" \
    -vf "setpts=PTS/${speed},fps=${target_fps},scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a" \
    -loop 0 "$TEMP_DIR/${name}.gif" 2>/dev/null

  gifsicle -O3 "$TEMP_DIR/${name}.gif" -o "$OUT_DIR/${name}.gif"
  local size=$(du -h "$OUT_DIR/${name}.gif" | cut -f1)
  local frames=$(gifsicle -I "$OUT_DIR/${name}.gif" 2>&1 | grep -o '[0-9]* images' | grep -o '[0-9]*')
  echo "  → $OUT_DIR/${name}.gif ($size, ${frames:-?} frames)"
}

convert_gif "import-flow"       "import-flow-cut.mp4"       15
convert_gif "aurelia-query"     "aurelia-query-cut2.mp4"    15
convert_gif "aurelia-analysis"  "aurelia-analysis-cut.mp4"  15
convert_gif "aurelia-mutation"  "aurelia-mutation-cut.mp4"  15

rm -rf "$TEMP_DIR"
echo "Done! GIFs in: $OUT_DIR"
