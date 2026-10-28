#!/usr/bin/env bash
# Runs src/utils/transcode.js (the standalone POC) against the inputs it meets in practice
# and checks what it writes. Usage: scripts/transcode.sh   (KEEP=1 keeps the files)
set -u
cd "$(dirname "$0")/.." || exit 1
POC="$PWD/src/utils/transcode.js"

bundled() { node -e "import('$1').then((m) => console.log(m.path)).catch(() => process.exit(1))" 2>/dev/null; }
FFMPEG=$(bundled @ffmpeg-installer/ffmpeg || command -v ffmpeg)
FFPROBE=$(bundled @ffprobe-installer/ffprobe || command -v ffprobe)
if [ -z "$FFMPEG" ] || [ -z "$FFPROBE" ]; then
  echo "FFmpeg/FFprobe not found — run npm install in video-transcoder first"
  exit 1
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/transcode-poc.XXXXXX")
if [ "${KEEP:-}" = 1 ]; then echo "Keeping files in $WORK"; else trap 'rm -rf "$WORK"' EXIT; fi

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }
first_error() { grep -m1 'Error' "$1" | sed 's/.*Error: //' | cut -c1-90; }

clip() { # name size seconds [extra ffmpeg args]
  local name=$1 size=$2 seconds=$3
  shift 3
  "$FFMPEG" -v error -y -f lavfi -i "testsrc=size=$size:rate=30:duration=$seconds" "$@" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$WORK/$name.mp4"
}

expect_ok() { # label input "240p=WxH ..." audio(yes|no)
  local label=$1 input=$2 expected=$3 audio=$4
  local out="$WORK/out-$label" log="$WORK/$label.log"
  echo "$label"
  if ! node "$POC" "$input" "$out" > "$log" 2>&1; then
    bad "exited with an error: $(first_error "$log")"
    return
  fi

  local actual="" squashed="" has_audio=yes r seg info
  for r in 240p 480p 720p 1080p; do
    seg="$out/hls/$r/segment_000.ts"
    [ -f "$seg" ] || continue
    info=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=width,height,sample_aspect_ratio -of csv=p=0 "$seg" | grep -m1 ,)
    actual="$actual $r=$(echo "${info%,*}" | tr , x)"
    [ "${info##*,}" = "1:1" ] || squashed="$squashed $r(${info##*,})"
    "$FFPROBE" -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$seg" | grep -q audio || has_audio=no
  done
  actual=${actual# }
  [ "$actual" = "$expected" ] && ok "renditions $actual" || bad "renditions: got [$actual], want [$expected]"
  [ -z "$squashed" ] && ok "square pixels" || bad "non-square pixels:$squashed"

  local listed want
  listed=$(grep -o 'RESOLUTION=[0-9x]*' "$out/hls/master.m3u8" | sed 's/RESOLUTION=//' | tr '\n' ' ')
  want=$(echo "$expected" | sed 's/[0-9]*p=//g')
  [ "${listed% }" = "$want" ] && ok "master.m3u8 lists $want" || bad "master.m3u8 lists [${listed% }], want [$want]"

  [ "$has_audio" = "$audio" ] && ok "audio: $audio" || bad "audio: got $has_audio, want $audio"

  if "$FFMPEG" -v error -i "$out/hls/master.m3u8" -map 0 -f null - 2> "$WORK/$label.decode" && [ ! -s "$WORK/$label.decode" ]; then
    ok "every rendition decodes through master.m3u8"
  else
    bad "decode errors: $(head -1 "$WORK/$label.decode")"
  fi
}

expect_aligned_segments() { # label
  local first="" segs dir
  for dir in "$WORK/out-$1"/hls/*/; do
    segs=$(grep EXTINF "$dir/playlist.m3u8" | sed 's/#EXTINF://;s/,.*//' | tr '\n' ' ')
    [ -z "$first" ] && first=$segs
    if [ "$segs" != "$first" ]; then
      bad "segment boundaries differ between renditions"
      return
    fi
  done
  if echo "$first" | tr ' ' '\n' | awk 'NF && $1 > 6.1 { long = 1 } END { exit long }'; then
    ok "every rendition cut at the same ≤6 s boundaries ($first)"
  else
    bad "segments longer than 6 s: $first"
  fi
}

expect_fail() { # label input message
  local label=$1 input=$2 message=$3
  local out="$WORK/out-$label" log="$WORK/$label.log"
  echo "$label"
  if node "$POC" "$input" "$out" > "$log" 2>&1; then
    bad "succeeded, should have failed"
    return
  fi
  grep -q "$message" "$log" && ok "fails with: $(first_error "$log")" || bad "unexpected error: $(first_error "$log")"
  [ -e "$out" ] && bad "left output behind" || ok "no output written"
}

echo "Generating test clips in $WORK"
clip landscape1080 1920x1080 4 -f lavfi -i sine=duration=4 -c:a aac -shortest
clip landscape720 1280x720 4 -f lavfi -i sine=duration=4 -c:a aac -shortest
clip portrait 1080x1920 4 -f lavfi -i sine=duration=4 -c:a aac -shortest
clip low480 854x480 4 -f lavfi -i sine=duration=4 -c:a aac -shortest
clip noaudio 1280x720 4
clip tiny 160x120 2
"$FFMPEG" -v error -y -i "$WORK/noaudio.mp4" -c copy -metadata:s:v:0 rotate=90 "$WORK/rotated.mp4"
# a hard scene cut at 7.3 s: x264 would put a keyframe there on its own
"$FFMPEG" -v error -y -f lavfi -i "testsrc=size=854x480:rate=30:duration=7.3" \
  -f lavfi -i "smptebars=size=854x480:rate=30:duration=12.7" -filter_complex "[0][1]concat=n=2:v=1" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$WORK/scenecut.mp4"
"$FFMPEG" -v error -y -f lavfi -i sine=duration=2 -c:a aac "$WORK/audio-only.m4a"
mkdir -p "$WORK/my videos" && cp "$WORK/landscape720.mp4" "$WORK/my videos/a clip.mp4"
head -c 200000 /dev/urandom > "$WORK/corrupt.mp4"
echo

expect_ok landscape-1080p "$WORK/landscape1080.mp4" "240p=426x240 480p=854x480 720p=1280x720 1080p=1920x1080" yes
expect_ok landscape-720p-no-upscale "$WORK/landscape720.mp4" "240p=426x240 480p=854x480 720p=1280x720" yes
expect_ok portrait-9x16 "$WORK/portrait.mp4" "240p=240x426 480p=480x854 720p=720x1280 1080p=1080x1920" yes
expect_ok source-480p "$WORK/low480.mp4" "240p=428x240 480p=854x480" yes
expect_ok rotated-phone-video "$WORK/rotated.mp4" "240p=240x426 480p=480x854 720p=720x1280" no
expect_ok no-audio-track "$WORK/noaudio.mp4" "240p=426x240 480p=854x480 720p=1280x720" no
expect_ok tiny-source "$WORK/tiny.mp4" "240p=320x240" no
expect_ok scene-cut-20s "$WORK/scenecut.mp4" "240p=428x240 480p=854x480" no
expect_aligned_segments scene-cut-20s

echo "paths-with-spaces"
spaced="$WORK/out dir"
if node "$POC" "$WORK/my videos/a clip.mp4" "$spaced" > "$WORK/spaces.log" 2>&1 && [ -f "$spaced/hls/master.m3u8" ]; then
  ok "input and output paths containing spaces"
else
  bad "failed with spaces in the path: $(first_error "$WORK/spaces.log")"
fi

expect_fail corrupt-file "$WORK/corrupt.mp4" "Not a readable video"
expect_fail audio-only-file "$WORK/audio-only.m4a" "no video stream"
expect_fail missing-file "$WORK/does-not-exist.mp4" "Input file not found"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
