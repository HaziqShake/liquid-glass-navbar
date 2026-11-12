#!/bin/bash
# Screenshot helper for the Liquid Navbar emulator checks.
# Usage: shot.sh <name>  -> saves ~/workspace/liquid-glass-navbar/screenshots/<name>.png
ADB=/home/hatch/Android/sdk/platform-tools/adb
OUT=~/workspace/liquid-glass-navbar/screenshots
NAME="$1"
if [ -z "$NAME" ]; then echo "usage: shot.sh <name>"; exit 1; fi
mkdir -p "$OUT"
$ADB exec-out screencap -p > "$OUT/$NAME.png"
ls -l "$OUT/$NAME.png"
