# Local emulator setup (VM, no cloud) — 12 Nov 2026

## What exists now
- SDK: `~/Android/sdk` — cmdline-tools (latest), platform-tools 37.0.1 (adb),
  emulator 37.1.8 (build 16833367), system image
  `system-images;android-33;google_apis;x86_64` rev 8 (installed by hand:
  sdkmanager could not fetch through the sandbox egress proxy — Java
  HttpURLConnection fails at doTunneling / manifest download, curl works).
- JRE: `~/Android/jre17` (Temurin 17.0.21). System Java 17 also installed via apt.
- AVD: `pixel7api33` (Pixel 7, API 33, 1080x2400, hw.ramSize=1024 in config but
  the emulator runs the guest with -m 2048 anyway).
  Created MANUALLY (`~/.android/avd/pixel7api33.avd/config.ini` +
  `~/.android/avd/pixel7api33.ini`) because `avdmanager create avd` dies with a
  bare `null` (NPE) after "Fetch remote repository... 100%".
- package.xml files for the emulator and the system image were hand-written
  (`/tmp/pkg/` originals) so sdkmanager/avdmanager recognise them.
- Symlinks (needed — the emulator trampoline ignores ANDROID_SDK_ROOT and
  looks for the legacy binary under `~/Android/emulator/`):
  `/home/hatch/Android/emulator`, `/home/hatch/Android/system-images`,
  `/home/hatch/Android/platform-tools` -> their `~/Android/sdk/...` targets.

## How to boot it
```bash
export ANDROID_SDK_ROOT=/home/hatch/Android/sdk ANDROID_HOME=/home/hatch/Android/sdk \
  ANDROID_AVD_HOME=/home/hatch/.android/avd ANDROID_I_WANT_MY_TCG=yes
nohup /home/hatch/Android/emulator/emulator -avd pixel7api33 -no-window -no-audio \
  -gpu swiftshader_indirect -memory 1024 -no-boot-anim -no-snapshot \
  -cores 2 -accel off >/tmp/emulator.log 2>&1 &
```
No `/dev/kvm` on this VM, so TCG software CPU emulation (`-accel off`,
`ANDROID_I_WANT_MY_TCG=yes`) is mandatory. SwiftShader for GL.

## Status 12 Nov ~11:20 UTC
- Emulator running since ~10:28 UTC (qemu pid 14669), ~52 min, ~130% CPU.
- First boot under TCG on this 1.5-shared-CPU cell is extremely slow.
  `adb devices` shows `emulator-5554` only as **offline** (it flaps in/out
  between exec calls); `adb shell` never worked; `sys.boot_completed` never 1.
- Guest is NOT dead: `userdata.img.qcow2` (~740 MB) is written to every few
  seconds, qemu stays at ~130% CPU, no fatal error in /tmp/emulator.log.
- Build 9 APK verified, NOT installed yet (nothing was ever installed — the
  emulator never booted far enough): md5 766fb063cef49df327c334c350418448,
  `~/workspace/appetize-x86/app-release.apk`.
- The emulator was left RUNNING so the boot can finish; check later with
  `adb devices` / `adb -s emulator-5554 shell getprop sys.boot_completed`.
  A warm relaunch (kill qemu, relaunch WITHOUT -wipe-data) resumes from the
  current userdata and should boot much faster.
- Screenshot helper: `~/workspace/liquid-glass-navbar/screenshots/shot.sh <name>`
  (uses `adb exec-out screencap -p`).
- To kill the emulator: `pkill -f qemu-system-x86_64` (do NOT use a pkill
  pattern that matches your own shell command line).
- Host is very tight on RAM (~220 MB free, guest takes ~2.4 GB); the running
  emulator is a real load on the VM — kill it if it is no longer wanted.
