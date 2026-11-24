#!/usr/bin/env bash
set -euo pipefail
apk="$PWD/apps/android/app/build/outputs/apk/release/app-release.apk"
evidence="$PWD/apps/android/app/build/runtime-evidence"
mkdir -p "$evidence"
adb shell pm path com.android.chrome
adb shell dumpsys package com.android.chrome | grep -m 1 versionName
# These flags apply only to the disposable CI emulator, never a user's browser.
adb shell 'echo "chrome --no-first-run --disable-fre --disable-default-browser-promo --enable-logging --v=1" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb logcat -c
adb logcat -v threadtime > "$evidence/startup-logcat.txt" &
logcat_pid=$!
trap 'kill "$logcat_pid" 2>/dev/null || true' EXIT
adb install -r "$apk"
adb shell pm verify-app-links --re-verify app.barberos.mobile
current_uri=https://barber-os-orpin.vercel.app/
adb shell am start -W -n app.barberos.mobile/.LauncherActivity
wait_for_screen() {
  local stage="$1"
  local launcher_recovered=0
  for attempt in $(seq 1 18); do
    if ! adb shell uiautomator dump /sdcard/barberos-ui.xml >/dev/null || ! adb pull /sdcard/barberos-ui.xml "$evidence/$stage.xml" >/dev/null; then
      sleep 2
      continue
    fi
    if python3 - "$evidence/$stage.xml" "$stage" <<'PY_CHECK'
import sys,xml.etree.ElementTree as E
nodes=list(E.parse(sys.argv[1]).getroot().iter('node'))
text=' '.join(x.get('text','')+' '+x.get('content-desc','') for x in nodes)
if any(x.get('resource-id')=='android:id/alertTitle' and x.get('text')=="Pixel Launcher isn't responding" for x in nodes):
    sys.exit(10)
assert 'BarberOS' in text, text[:500]
assert any(x.get('package')=='com.android.chrome' for x in nodes), 'No supporting browser runtime'
assert not any(x.get('resource-id','').endswith('/url_bar') for x in nodes), 'Custom Tab fallback: domain verification did not complete'
assert not any(t in text for t in ['ERR_INTERNET_DISCONNECTED','ERR_NAME_NOT_RESOLVED','ERR_CERT_AUTHORITY_INVALID']), text[:500]
if sys.argv[2]=='login':
    assert 'Email' in text and 'Palavra-passe' in text and 'Entrar' in text, text[:500]
else:
    assert 'Palavra-passe' not in text, 'Unexpected login route after home/foreign intent'
PY_CHECK
    then
      adb exec-out screencap -p > "$evidence/android-$stage.png"
      return 0
    else
      status=$?
      if [ "$status" -eq 10 ] && [ "$launcher_recovered" -eq 0 ]; then
        # Recover only the unrelated emulator launcher ANR. Browser/app ANRs stay fatal.
        adb exec-out screencap -p > "$evidence/emulator-launcher-anr-$stage.png"
        adb shell dumpsys activity lastanr > "$evidence/emulator-launcher-anr-$stage.txt"
        adb shell am force-stop com.google.android.apps.nexuslauncher
        adb shell am start -W -n app.barberos.mobile/.LauncherActivity -a android.intent.action.VIEW -d "$current_uri"
        launcher_recovered=1
      fi
    fi
    sleep 5
  done
  adb exec-out screencap -p > "$evidence/android-failure.png"
  adb shell pm get-app-links app.barberos.mobile > "$evidence/domain-verification.txt"
  adb logcat -b crash -d > "$evidence/crashes.txt"
  adb shell dumpsys activity activities > "$evidence/activities.txt"
  echo "Android runtime acceptance failed at $stage; evidence captured" >&2
  return 1
}
wait_for_screen home
# Exercise a warm first-party deep link through the actual exported launcher.
current_uri=https://barber-os-orpin.vercel.app/entrar
adb shell am start -W -n app.barberos.mobile/.LauncherActivity -a android.intent.action.VIEW -d "$current_uri"
wait_for_screen login
# Even an explicit exported-activity intent must never load an untrusted origin.
current_uri=https://example.com/untrusted-native-intent
adb shell am start -W -n app.barberos.mobile/.LauncherActivity -a android.intent.action.VIEW -d "$current_uri"
wait_for_screen rejected-foreign-intent
adb shell dumpsys activity activities > "$evidence/activities.txt"
adb shell pm get-app-links app.barberos.mobile > "$evidence/domain-verification.txt"
echo 'PASS | installed signed Android APK: verified full-screen production, warm login deep link, rejected foreign intent'
