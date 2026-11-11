# Liquid Navbar

Haziq's own liquid glass navbar, built from scratch in Expo React Native.
A floating pill tab bar in liquid glass: real blur plus true refraction
from a native AGSL RenderEffect module (hardware path, never a software
backdrop capture).

## The navbar

- **Floating pill tab bar.** Real blur (`expo-blur` with a
  `BlurTargetView` and `blurMethod="dimezisBlurViewSdk31Plus"`) plus true
  refraction from the native module. Bar tint fixed at 0.30, the iOS 27
  default. Dark and light modes.
- **The droplet.** A completely transparent, refractive lens over the
  active tab. No fill, no tint, no colour, no blur. A lightweight native
  shader magnifies the icons WITHOUT scaling the icon views — the lens
  does the magnifying. The shader's displacement is zero at the exact
  centre and grows toward the rim, so the middle icon reads clean. When
  held, the droplet renders OVER the navbar (an unclipped sibling overlay
  above the bar silhouette), never inside it.
- **Edge light.** A gradient stroke around the bar, brightest at the two
  opposite corners (top-left and bottom-right), fading fast to 0 along
  the edges — about 25% of each edge lit near the corner, 75%
  transparent. A 1px SVG rect stroke with a diagonal gradient, plus a
  faint 3px halo.
- **Bar size.** Driven ONLY by the scroll shrink (labels collapsing).
  The shrunk bar never grows when switching tabs, and holding never
  makes the bar big. No hold growth, no press scale on the bar.
- **Motion.** Liquid and reactive through one soft spring of its own (a
  single `withSpring` on the droplet's tab position) and short timings
  for the hold lift. No coupled spring engine, no squash and stretch, no
  rubber banding.
- **Worklet safety.** No worklet is ever called synchronously from the JS
  thread. Gesture callbacks call worklets worklet-to-worklet on the UI
  thread; selection reaches JS only via `runOnJS`; JS-side sync goes
  through `runOnUI`. The scroll handler runs on an
  `Animated.ScrollView`, never a plain `ScrollView` with a worklet.

## Gestures

- **Tap** a tab to switch. The droplet glides there on one soft spring.
- **Hold** (150ms) to lift the droplet over the bar. It swells slightly;
  the bar and the icons never change size.
- **Drag** across the bar. The droplet follows your finger and snaps to
  the nearest tab on release.
- **Scroll** down to shrink the bar (labels collapse). Scroll up to
  bring them back. Switching tabs never grows the shrunk bar.

## Settings (in the demo sheet)

Blur, refraction strength, droplet magnification, edge light intensity,
veil, mode (dark/light), background. Nothing else.

## Structure

- `src/components/LiquidNavbar.tsx` — the navbar. One component, no
  spring engine.
- `src/components/SettingsSheet.tsx` — the demo settings sheet.
- `src/screens/DemoScreen.tsx` — scrolling photo demo, 9 test
  backgrounds, BlurTargetView, scroll handler.
- `src/settings/settings.ts` — the settings shape and defaults.
- `src/data/backgrounds.ts` — the 9 test backgrounds.
- `modules/liquid-glass-refraction/` — local Expo module. `RefractionView`
  is the bar's AGSL refraction shader (adapted from GlassBarShader.kt,
  GPL-3.0 — see the attribution comments in the Kotlin sources).
  `DropletRefractionView` is the droplet's own magnification-lens shader,
  written from scratch: zero displacement at the centre, bend growing
  toward the rim.

## Crash fixes baked in

1. The native views apply their RenderEffect ONLY once they have a real
   size (`ensureEffect()` from `onSizeChanged`, `onLayout` and
   `onAttachedToWindow` via `post`). Applying the shader at zero size
   left its uniforms at zero and it returned transparent.
2. The TS wrapper gives every refraction view an EXPLICIT size (bar size
   + 48dp, positioned -24dp) so its size can never be zero.
3. Worklets are never called synchronously from the JS thread (see
   "Worklet safety" above).

## Build

GitHub Actions (`.github/workflows/android-apk.yml`): `npm ci`, `expo
prebuild --clean`, Gradle assembleRelease, arm64. The APK lands in
`~/workspace/your_files/liquid-glass-navbar.apk`.

Local Gradle builds are blocked on this VM: the runtime denies direct
TCP from Java processes, and Gradle's client talks to its daemon over
loopback TCP. Do not build locally until that permission is flipped.
