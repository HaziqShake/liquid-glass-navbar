# Liquid Glass Navbar

A standalone demo of a true liquid glass bottom navbar for React Native
(Expo). One refractive bar, one sliding magnifying droplet as the active tab
indicator, over switchable stock photo backgrounds.

Liquid glass is a physically based material, not a blur panel. It refracts
(bends the light of whatever is behind it), reflects (specular highlights on
the edges, light from the top), and adapts (tint from the backdrop). If it
looks frosted, it is wrong.

## Backgrounds

The demo ships with five stock photos from Unsplash plus one flat colour, all
in `assets/backgrounds/`:

- Lake: mountain lake, sharp detail everywhere, the best refraction test.
- Night: night peaks, dark scene with bright stars, tests the specular rim.
- Ocean: ocean wave, high-frequency water texture under the bar.
- Gradient: soft violet gradient, the minimum the glass needs to read at all.
- Hills: foggy hills, low contrast, shows how the legibility veil helps.
- Flat: a flat `#2B2B2B` colour. The glass has nothing to bend, so it nearly
  disappears. That is the point of the option: glass refracts its backdrop,
  and over a flat background it looks like a flat panel.

The backgrounds follow the library's own rule: the glass needs
high-frequency detail behind it, a photo, text, a busy list, a gradient at
minimum. Test it over an image first.

## Run it

This is a native module. It needs a real development build and never works in
Expo Go.

```bash
npm install
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

Full refraction (the AGSL shader) needs Android 13+ (API 33). iOS 26 uses
Apple's `UIGlassEffect`. Below API 33 the library falls back in tiers: blur
on API 31-32, plain tint below that. The pill at the top of the demo screen
shows the tier the device actually rendered: `glass`, `refraction`, `blur`,
`tint` or `none`.

## What is in here

- `src/components/LiquidGlassNavbar.tsx`: the bar and the droplet.
- `src/components/BlurScrim.tsx`: a gradient of blur behind the bar, so
  scrolled content dissolves into blur instead of fading into a colour.
- `src/context/NavScrollContext.tsx`: the scroll handler, shrink-on-scroll
  state, and the glass pause flag.
- `src/screens/DemoScreen.tsx`: background switcher, tier readout, and
  scrolling cards that pass under the bar.
- `src/data/backgrounds.ts`: the background list.

## How it is tuned

Bar (`variant="clear"`, never the frosted `floatingTabBar` preset):

| Prop | Value |
| --- | --- |
| thickness | 0.75 |
| blurRadius | 6 |
| iridescence | 0 |
| saturation | 0.8 |
| edgeReflectionStrength | 0.35 |
| legibilityFloor | 0.4 |
| interactive | true |
| borderRadius | 32 |

Droplet (the active tab lens, a sibling above the bar, never clipped inside
it, never merged with `LiquidGlassContainer`):

| Prop | Value |
| --- | --- |
| thickness | 1.0 |
| blurRadius | 4 |
| iridescence | 0 |
| saturation | 0.8 |
| edgeReflectionStrength | 0.5 |
| borderRadius | 99 |

Geometry: bar is 90 percent of screen width, 64 high, radius 32. It shrinks
to 70 percent width and 50 high while scrolling down, labels fade out, icons
shrink to 0.88. The droplet is 90 percent of one tab slot wide and 90 percent
of bar height. Its center is the jelly position spring, and its scale is the
squash-and-stretch formula below. Magnification stays at 1: distortion is
wanted, a bubble is not. The lens displacement is `14.85dp x thickness`, so
0.75 gives a calm 11.1dp rim bend and 1.0 gives 14.85dp; 1.4 would be 20.8dp
and reads as a defect.

Interactions: touch the droplet and drag it to another tab, release to snap
and navigate. No long-press to enter drag mode. A tap (moved less than 4 dp)
selects the tab under the finger. Tapping any tab while the bar is shrunk pops
it back open first.

## Water physics (jelly springs)

The refraction is only half the liquid feel. The motion comes from a
hand-written spring engine ported from Anivio's `JellyMotion`: eleven coupled
springs stepped by an analytic damped-oscillator solver on every frame, with
the frame loop sleeping when every spring is at rest. The code lives in
`src/jelly/` (`JellySpring.ts` is the solver, rubber band and panel offset;
`useJellyMotion.ts` is the state machine).

Spring table (stiffness, damping ratio):

| Spring | Stiffness | Damping | Role |
| --- | --- | --- | --- |
| position | 1000 | 1.0 | Pill center, critically damped, no overshoot on travel |
| velocity | 300 | 0.5 | Tracks position velocity, drives squash and stretch |
| press | 1000 | 1.0 | 0 to 1 while the finger is down |
| scaleX | 250 | 0.6 | Pill X scale, 1.0 resting / 1.3 pressed |
| scaleY | 250 | 0.7 | Pill Y scale, same targets, settles out of phase with X |
| panel | 300 | 1.0 | Raw horizontal drag offset for the panel lag |
| trackY, trackX, trackPress, glow | 266.67 | 0.612 | Whole-bar distortion springs |

What it does, in order of visibility:

- **Squash and stretch.** The droplet stretches along its direction of
  travel and squashes vertically, both proportional to speed: X is the scale
  spring divided by `(1 - clamp(speed * 0.75, ±0.2))` (up to 25 percent
  longer), Y is the scale spring times `(1 - clamp(speed * 0.25, ±0.2))`
  (up to 20 percent shorter). Icons inside grow to 1.2x while held
  (`1 + 0.2 * press`).
- **Press grow with delayed relax.** The pill grows to 1.3x on touch down
  and only relaxes back to 1.0 once it is nearly home (within
  `max(1, maxIndex) * 0.025` of its target), so the squash lands at the
  destination instead of mid-flight.
- **Rubber-band track distortion.** While dragging, the whole bar pulls down
  with the finger (rubber-banded, quarter strength), narrows up to 8 percent,
  and swells to 1.025x, all pivoting on the touch point. On release the track
  springs wobble it back.
- **Panel lag.** The bar content trails the finger by a ±4 dp eased offset
  (cubic-bezier solve, x-control 0.58), which is what makes it feel like
  dragging through water rather than glued to the finger.
- **Touch glow.** A radial gradient (radius 300, peak alpha 0.15) centered on
  the finger while dragging.
- **Tap vs drag.** Moved less than 4 dp is a tap on the tab under the finger;
  otherwise it snaps to the nearest tab on release. No long-press to enter
  drag mode.

The scroll shrink is also jelly-flavoured: the bar only shrinks after 60 px
of same-direction scroll, then eases over 300 ms on the standard curve
`cubic-bezier(0.2, 0, 0, 1)`.

## Two rules that will save you a day

1. The scroll handler is a reanimated worklet. Pass it only to
   `Animated.ScrollView`. A plain `ScrollView` cannot execute worklets and
   crashes with `TypeError: Object is not a function` in `_handleScroll`.
   Modal scrolling must never drive the navbar.
2. Glass capture pauses while scrolling. The Android backdrop-capture
   pipeline crashes when a visible glass view captures during scroll, so the
   scroll handler pauses both glass views on drag and momentum start and
   resumes on end. While paused the glass holds its last frame.

## Debugging

`onPipelineReady` on the bar reports the tier that actually rendered, shown
in the demo header. If the bar looks wrong, read the tier first: it tells you
whether the device ran the shader, fell back to blur, or rendered nothing.
`onError` fires for shader compile failures (`SHADER_COMPILE_FAILED`).

## Credits

- Glass: [`react-native-liquid-glassmorphism`](https://github.com/himanshu-lal4/react-native-liquid-glassmorphism)
- Photos: Unsplash
- Icons: Phosphor
- Fonts: Inter
