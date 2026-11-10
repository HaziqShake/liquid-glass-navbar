# Liquid Glass Notes

A running record of what the glass should look like, from the references Haziq shared. Keep updating this as he sends more.

## The target in one line
Apple's liquid glass: a real lens, not a frosted panel. The background bends (refraction), the blur is perfectly smooth, and the edge is crisp with directional light.

## References

### 1. Apple News+ tab bar (image.png)
- Pill-shaped tab bar, frosted white/translucent.
- The background (News+ card, colourful content) is visible through the glass, blurred and slightly distorted at the edges.
- Icons stay razor sharp on top.
- The bar's edge has a thin bright rim with a soft inner shadow.

### 2. iOS dial pad glass variants (image-3.png)
Four variants, same button, different glass:
- iOS 26 clear: almost pure glass, background bends right through it, barely any tint.
- iOS 27 max clear: same, even clearer.
- iOS 27 default: the target. Moderate tint, glass has some body, but the background is still clearly visible through it, bending and refracting. Not crystal clear, not heavily tinted.
- iOS 27 max tinted: most coloured, glass carries a pink tint, background more muted behind it.

Haziq wants the glass close to iOS 27's default.

### 3. OriginOS 7 widgets (image-2.png)
- Vivo's "Dynamic Translucent Material" / "Premium Texture engine", on Android 17.
- Three modes: Realistic (full liquid glass, maximum transparency, refraction, lighting), Natural, Soft (progressively more frosted), plus a Tinted option.
- Vibrant colour bleed: the wallpaper's saturated colours show through strongly and tint the widgets. Apple's glass is neutral and restrained; OriginOS lets the wallpaper dominate. Apple is a clean lens, OriginOS is a stained-glass lens.
- Thick, glossy lens look. Background heavily blurred but colours stay vivid. Content (numbers, icons, album art) stays razor sharp.
- Bright, crisp rim, more pronounced and glossier than Apple's, with a soft shadow underneath for depth.
- Refraction at the edges, especially at rounded corners. Light moves across edges when content moves.
- Light harvesting: curved borders catch dominant tones from the wallpaper, creating natural coloured highlights on the edges.
- Dynamic lighting / gyroscope tracking: tilting the phone shifts ambient reflections across widget edges. "Dynamic Glow" makes touch elements bounce, stretch, flow with finger direction and speed.
- GPU-heavy: Vivo restricts the full effect to flagship chips. The Vivo V80 (Snapdragon 7 Gen 4) lacks it entirely.

### 4. iOS Control Center (image-4.png)
- Toggles (airplane, WiFi, Bluetooth, cellular) in glass circles; music player widget; vertical glass pill sliders (brightness, volume); Focus button; orientation lock; Do Not Disturb; flashlight; calculator; camera.
- The glass is light and airy, not dark. The background photo shows through clearly, blurred and refracted.
- Every control has a bright, crisp rim and a soft shadow. The glass reads as a thin, polished lens sitting on the screen.
- Same three qualities: refraction, smooth blur, crisp edge.

### 5. WWDC25 liquid glass hero (image-5.png)
- Apple's canonical liquid glass image. A large, organic, liquid-like glass form (two blobs merged into one flowing shape) over a light gray grid.
- The glass form is not a rigid rectangle. It flows and merges like a liquid, showing the "liquid" quality of the material.
- The grid lines behind it bend dramatically through the glass. Strong, clear refraction, the lines warp around the curves.
- The edge has a bright rim and a subtle chromatic fringe (a hint of rainbow iridescence) at the bottom edge.
- The glass is very clear, light, and airy, with a soft, milky quality. The background is visible through it, distorted but not obscured.

## The three qualities that differentiate Apple (and the good implementations) from the rest
1. **Refraction.** The background actually bends as it hits the edge of the glass. It does not just get blurrier. Text and colours warp around the curve. This is the lens effect.
2. **Smoothness of the blur.** Perfectly smooth, no banding, no noise, no choppy steps. The background melts into a soft wash, and the foreground stays razor sharp.
3. **The edges.** A thin bright rim with a soft inner shadow is what makes it read as glass instead of a frosted panel. The edge catches the light and the whole piece gets its depth from that.

## Edge lighting (Haziq, 10 Nov)
The glass edge catches light on the **top left** and falls to **shadow on the bottom right**. Directional light. The top-left edge is bright/highlighted, the bottom-right edge is darker/shadowed. This is what gives the glass its depth and makes it read as a physical object with a light source.

### The edge lighting game (10 Nov, image-6.png)
Haziq sent a dark glass navbar screenshot and asked where the edge lighting is. The answer: the edge lighting is on the top and the bottom, exactly opposite each other. The top edge has a thin, bright white rim (strongest at the top-left and top-right corners). The bottom edge glows green, because the green light source below the bar catches the bottom rim. Same thin line, opposite sides, different colour because the light sources differ. The left and right edges are dark, no light there.

### Liquid glass reacts with the colour around it (Haziq, 10 Nov)
Liquid glass does not only bend its background colour (refraction). It also REACTS with the colour around it. Ambient light and nearby colours tint the glass and its edges. In the screenshot (image-6.png), the green glow below the bar makes the bottom edge glow green and tints the glass, it does not stay neutral white. The glass picks up the dominant ambient colour. This is the same as OriginOS's "light harvesting" (the curved borders catch dominant tones from the surroundings). So the edge light should not always be white; it should pick up the ambient/background colour. And the glass tint should react to its surroundings, not stay a fixed neutral.

### Instagram / App Store navbar (image-7.png, 10 Nov)
- Two glass navbars (Instagram and App Store) over a light background with a glowing shape behind.
- The droplet (pill) has refraction too, and it is CLEARER than the navbar's refraction.
- The droplet COLOURS whatever icon it touches, but only the part under the droplet. It does not turn completely blue itself; whatever part of the icon is under the droplet is the one that gets coloured blue. The rest of the icon stays its normal colour. This is a selective colour fill, the droplet fills the icon with colour where they overlap.
- The navbar has a legibility veil and a frostier blur compared to the droplet, which is completely clear. But the navbar still has refraction too, just frostier and less clear than the droplet.
- The droplet only refracts when you HOLD it, not always.
- Tapping does not increase the navbar size, but holding does.
- When the droplet approaches an icon, it enlarges, and that enlargement must be SMOOTH, not instant.
- The touch glow belongs INSIDE the navbar, not outside it.

## What NOT to do
- Do not make it a frosted panel (heavy blur + tint, no refraction). That is not liquid glass.
- Do not use a software backdrop capture (drawing the root view into a bitmap). That is what caused the freeze, lag, and crashes in the earlier builds.
- Do not use a snapshot backdrop (not live). It recreates the frozen-screenshot problem.
- Do not use Skia BackdropFilter for the navbar (it cannot see native views).
- Do not use SVG displacement for backdrops (not supported).
- Do not expect expo-blur alone to refract. It is blur only.

## Haziq's corrections after testing the Anivio build (10 Nov 16:23)
- **Refraction:** add the liquid-glass lens refraction back, like the old navbar. The background must bend through the glass at the edges. Done via a native AGSL RuntimeShader (RenderEffect, hardware path), modeled on Anivio's GlassBarShader.kt, in `modules/liquid-glass-refraction/`. Never a software capture.
- **Droplet on top:** the droplet (pill) must be drawn as a sibling ABOVE the navbar, not clipped inside it. When held it grows and draws over the navbar silhouette.
- **Droplet moves as a whole:** when dragging, the pill must travel as a solid droplet. It must not look like a static cookie cutter with only the insides moving. Fixed by driving the pill with transforms (translateX + squash), not layout props.
- **Tap moves the droplet:** tapping a tab must move the droplet to that tab (it was swipe only). A Tap gesture now calls the jelly `tap` worklet.
- **Bar grows when held:** when holding the droplet, the BAR itself must increase in size, not just the icons. The bar now grows ~6% (layout size) while held.
- **Shrunken blur shift:** in the shrunken state the background inside the bar was shifted left, mismatching the blur, with a dark band at the bar's right end. Cause: the bar shrank via a scale transform while the BlurView blurred the unscaled layout region. Fixed by animating the bar's layout width/height instead of a scale transform.
- **Edge lighting (corrected):** the edge light must be THIN, very thin (~1px), glowing ONLY on the top-left and the bottom-right, exactly opposite each other (or top and very bottom). Not thick, not a full border. Implemented as a 1px stroke with a diagonal gradient bright only at the two opposite corners, plus a faint wider underlay for the glow halo.

## Expo React Native: what is actually possible

### Real blur on Android (critical)
expo-blur on Android defaults to `blurMethod='none'`, which renders just a semi-transparent view, NOT a blur. A real blur needs:
- Wrap the content to be blurred in a `BlurTargetView` and pass its ref to the BlurView as `blurTarget`.
- Set `blurMethod='dimezisBlurViewSdk31Plus'` (Android 12+, uses the efficient RenderNode API; falls back to 'none' on older Android).
- `blurReductionFactor` (default 4) divides the intensity on Android.

This was verified in the installed expo-blur 57.0.3 types (`node_modules/expo-blur/build/BlurView.types.d.ts`). The Anivio build (run 42795247982) did NOT have this, so its bar showed as a dark panel, not a blur, on Android.

### True refraction on Android
The only true refraction path on Android is a custom native module using Android's `RenderEffect` with a `RuntimeShader` (AGSL) applied as a hardware effect over the live backdrop, essentially what Anivio's `GlassBarShader` does in Compose. That requires bespoke Kotlin native code wired into the Expo dev build. It is significant work and high risk, and it must use the hardware RenderEffect path, never a software capture. Do this last, only after the blur is proven and the bar is stable.

### Cheaper approximations (do these first)
- **Coloured edge glow (light harvesting).** Tint the bar's edge highlight (and touch glow) with the background photo's dominant colour instead of pure white. The demo's backgrounds are a known set of photos, so a dominant/accent colour can be assigned per background. This is OriginOS's signature effect and the cheapest way to get its vivid character.
- **Glass modes (Realistic / Natural / Soft).** Mirror OriginOS's three modes. Realistic = high blur intensity + low fill opacity (colours bleed through, vivid). Natural = medium. Soft = lower blur + higher fill (more frosted). This is just the blur intensity plus the fill opacity driven by one setting. It also matches the iOS dial-pad tint variants.
- **Layered rim.** A bright outer rim, a softer inner glow, and a subtle inner shadow, using SVG gradients. Keep it subtle; Haziq already said the rim was too harsh once.
- **Fill tuning.** The fill controls how vivid the bar feels. A dark fill (e.g. rgba(28,28,30,0.55)) mutes the wallpaper colours. Lower it (or make it per-mode) so the photo's colours show through more, like OriginOS's Realistic mode and iOS 27 default.

## Sources (OriginOS)
- https://gadgets.beebom.com/news/vivos-originos-7-update-official-with-liquid-glass-atomic-workbench-new-ai-features
- https://www.91mobiles.com/hub/originos-7-unveiled-globally-vivo-iqoo-smartphones/
- https://techpp.com/2026/10/06/originos-7-features/
- https://us.smartprix.com/bytes/originos-7-first-look-a-major-visual-overhaul-with-much-smoother-animations/
- https://nokiapoweruser.com/originos-7-liquid-glass-widgets-complete-overview/
- https://nokiapoweruser.com/originos-7-light-shadow-aesthetics-guide/
- https://nokiapoweruser.com/originos-7-internal-beta-experience/

## 10 changes from Haziq (10 Nov, image-7.png: Instagram + App Store glass navbars)

Implemented in the repo, uncommitted, no build yet (build gate: only on his command).

1. **Dark / light mode.** A `mode` setting ('dark' | 'light'). Dark: dark fill + white icons. Light: light fill + dark icons. Blur and refraction work the same in both; the refraction shader's tint colour follows the mode via a new `tintColor` uniform (`[28/255,28/255,30/255]` dark, `[1,1,1]` light). Pill, icons, edge light and veil all adapt.
2. **Better test photos.** 9 backgrounds now (4 kept + 5 new): abstract paint (strong colour), sharp architecture (hard edges), vivid sunset field, bright beach (light-mode test), neon city night (dark, coloured lights). All 1080x2400 local files. Each background has an `accent` (dominant colour) for the ambient edge light.
3. **Legibility veil.** A `legibilityVeil` setting (default 0.25). An adaptive veil under the icons: dark translucent in dark mode, light translucent in light mode. Sits between the glass surface and the icons; never touches blur or refraction.
4. **Refraction / blur, no colours.** Refraction (native AGSL) and blur kept as-is. NO colour effects added to the refraction. The ambient-colour reaction is applied to the EDGE LIGHT only: the edge stroke is tinted with the background photo's accent colour instead of always white. Edge light stays thin (1px) and exactly opposite (top-left / bottom-right).
5. **Droplet colour fill (now).** The part of an icon under the droplet turns blue, ONLY that part. Implemented as a second icon row in blue, clipped to the droplet's bounds (a container exactly the pill's size, overflow hidden, tracking the pill's translateX). The droplet itself stays translucent and does NOT turn blue. NO refraction on the droplet yet.
6. **Glow inside the bar.** The touch glow moved from the pill overlay (overflow visible, leaked outside) into the bar's overflow-hidden container, so it is clipped to the pill shape and can never render outside the bar.
7. **Smooth droplet enlargement.** As the droplet approaches a tab it grows gradually: `approachScale` = 1 + 0.15 * proximity, where proximity is 1 on a tab centre and 0 halfway between tabs, driven by the spring-smoothed position. Never snaps.
8. **Droplet refraction only when held (deferred).** The droplet has NO refraction yet. When added, it must be active ONLY while held. Recorded in code as an `isHeld` derived value (holdPress > 0.5) that gates it. The navbar's own refraction stays always-on.
9. **Tap does not grow the bar; hold does.** The bar's ~6% growth now reads `holdPress` (1 only when the press is sustained > 150ms or dragged > 4dp), not `press`. A quick tap never grows the bar. `press` still drives the icon/pill feedback on tap.
10. **Droplet clearer than navbar; navbar frostier.** Navbar blur default raised 80 -> 90 and the legibility veil added (frostier). The droplet is completely clear (no blur, no veil, just translucent fill + colour fill). When droplet refraction is added later it must be clearer than the navbar's.
