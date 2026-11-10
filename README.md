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
of bar height, slides on a `pillIndex` shared value, squishes to 1.05
mid-transition, and grows to 1.22x while held. Magnification stays at 1:
distortion is wanted, a bubble is not. The lens displacement is
`14.85dp x thickness`, so 0.75 gives a calm 11.1dp rim bend and 1.0 gives
14.85dp; 1.4 would be 20.8dp and reads as a defect.

Interactions: hold the droplet (long-press 200 ms) and drag it to another tab,
release to snap and navigate. A plain tap on it acts as a tap on the active
tab. Tapping any tab while the bar is shrunk pops it back open first.

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
