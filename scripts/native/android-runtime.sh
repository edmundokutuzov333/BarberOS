#!/usr/bin/env bash
set -euo pipefail
apk="$PWD/apps/android/app/build/outputs/apk/release/app-release.apk"
evidence="$PWD/apps/android/app/build/runtime-evidence"
mkdir -p "$evidence"
adb shell pm path com.android.chrome
# These flags apply only to the disposable CI emulator, never a user's browser.
adb shell 'echo "chrome --no-first-run --disable-fre --disable-default-browser-promo" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb logcat -c
adb logcat -v threadtime AndroidRuntime:E chromium:E ActivityTaskManager:W TwaLauncher:D LauncherActivity:D '*:S' > "$evidence/startup-logcat.txt" &
logcat_pid=$!
trap 'kill "$logcat_pid" 2>/dev/null || true' EXIT
adb install -r "$apk"
adb shell am start -W -n app.barberos.mobile/.LauncherActivity
for attempt in $(seq 1 18); do
  adb shell uiautomator dump /sdcard/barberos-ui.xml >/dev/null
  adb pull /sdcard/barberos-ui.xml "$evidence/window.xml" >/dev/null
  if python3 - "$evidence/window.xml" <<'PY'
import sys,xml.etree.ElementTree as E
root=E.parse(sys.argv[1]).getroot()
nodes=list(root.iter('node'))
text=' '.join(x.get('text','')+' '+x.get('content-desc','') for x in nodes)
assert 'BarberOS' in text, text[:500]
assert any(x.get('package')=='com.android.chrome' for x in nodes), 'No supporting browser runtime'
assert not any(x.get('resource-id','').endswith('/url_bar') for x in nodes), 'Custom Tab fallback: domain verification did not complete'
assert not any(t in text for t in ['ERR_INTERNET_DISCONNECTED','ERR_NAME_NOT_RESOLVED','ERR_CERT_AUTHORITY_INVALID']), text[:500]
PY
  then
    adb exec-out screencap -p > "$evidence/android-home.png"
    adb shell dumpsys activity activities > "$evidence/activities.txt"
    echo 'PASS | installed signed Android APK opened verified full-screen production runtime'
    exit 0
  fi
  sleep 5
done
adb exec-out screencap -p > "$evidence/android-failure.png"
adb logcat -b crash -d > "$evidence/crashes.txt"
adb shell dumpsys activity activities > "$evidence/activities.txt"
adb logcat -d -t 1000 > "$evidence/logcat.txt"
echo 'Android runtime acceptance failed; evidence captured' >&2
exit 1
