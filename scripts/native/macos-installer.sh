#!/usr/bin/env bash
set -euo pipefail
image="$(find apps/desktop/release -maxdepth 1 -name '*.dmg' -print -quit)"
test -n "$image"
mount="$RUNNER_TEMP/barberos-dmg"
mkdir -p "$mount"
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$image"
trap 'hdiutil detach "$mount" || true' EXIT
test -L "$mount/Applications"
test "$(readlink "$mount/Applications")" = '/Applications'
test -s "$mount/BarberOS.app/Contents/Resources/Assets.car"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconName' "$mount/BarberOS.app/Contents/Info.plist")" = 'AppIcon'
codesign --verify --deep --strict "$mount/BarberOS.app"
echo 'PASS | DMG application, Applications link, modern icon catalogue and ad-hoc signature'
