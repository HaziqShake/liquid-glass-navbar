# Liquid Glass Notes

A running record of what the glass should look like, from the references Haziq shared. Keep updating this as he sends more.

## SCRAPPED: Anivio navbar (11 Nov 2026)
Haziq: scrap the Anivio navbar and forget it entirely. Do not revive it, do not build on it. New direction: HIS OWN navbar logic, with liquid glass refraction and such. The crash reasons are already known, so they are covered: (1) a Reanimated worklet called synchronously from the JS thread instead of the UI runtime, (2) the native refraction module's android/ files silently ignored by a bare `android/` line in .gitignore, so the module never compiled in CI, (3) the shader applied at zero view size, so its uniforms were zero and it returned transparent. The Anivio-specific behaviours (jelly springs, droplet, tap/hold growth, Anivio's pill) are scrapped with it, pending his own navbar logic spec.

### His navbar logic (11 Nov 2026, in progress)
- It should have a **liquid feel in its interactions**. It should be **reactive**.
- It must be **not at all similar to Anivio**. No Anivio-style jelly springs, no Anivio pill/droplet behaviour, no rubber banding copied from Anivio. The liquid feel and reactivity must come from his own logic, not Anivio's. Exact interactions still to be specified by him.
- The term **droplet stays**, coined by him: the droplet is **completely transparent and refractive**. No fill, no tint, no colour — a clear lens that bends the background. This is NOT what Anivio had (Anivio's pill carried an accent fill and glow). His droplet is transparency + refraction only.
- The droplet **magnifies the icons, without scaling them up**. The magnification comes from the lens itself, a **lightweight shader applied on the droplet** that bends what is behind it, NOT from scaling the icon views with a transform.
- When you **hold** the droplet, it is **over the navbar, not inside it**: drawn above the bar silhouette, unclipped, popping over the bar.
- **No blur on the droplet.** Refraction only, never a BlurView on the droplet.
- **No distortion in the exact middle icon.** The droplet shader must have zero displacement at its center, with the bend/magnification increasing toward the rim, so the icon sitting exactly in the middle reads clean and undistorted.
- The **shrunk navbar must not grow when you switch tabs**.
- **Do not make the navbar big when you hold.** No bar growth on hold at all. Bar size is driven only by the scroll shrink, never by hold or tab switch.
- 11 Nov: spec complete, **start building** his navbar from scratch. Anivio code is not to be built on.
- 11 Nov: **BUILT from scratch and verified** (LiquidNavbar.tsx, DropletRefractionView.kt, settings rewired, AnivioNavbar.tsx + src/jelly/ deleted). tsc clean, zero Anivio/jelly references in src. Uncommitted, nothing pushed, build starts only on his "build" command. Device-only checks remain: droplet magnification readability at 1.25x, blur-through-refraction. Logcat tags: RefractionView / DropletRefractionView.
- **BUILD SUCCEEDED 11 Nov** (commit c52445e, run 42971530275, 9m0s): APK at ~/workspace/your_files/liquid-glass-navbar.apk (43 MB, com.liquidglass.navbar, "Liquid Navbar", real file now; the old symlink into the Tahseen Anivio goal folder was removed and the file moved out of that goal's folder). Sent to Haziq 11 Nov.
- **BUILD 1 FAILED ON DEVICE (11 Nov, his verdict: "it works WRONG")**: edge light renders as a V shape, not a corner-fade stroke; NO refraction at all on device; NO droplet visible. The native module IS in the APK (verified in classes2.dex), so the RenderEffect never applied at runtime. STANDING RULE (11 Nov): when he criticises something, rebuild it completely from scratch, never patch. Rebuild underway: edge light via radial corner gradients, droplet rebuilt, refraction effect applied eagerly with logging on every attempt.
- **REBUILD DONE AND VERIFIED 11 Nov**: edge light rebuilt (two radial-gradient pill rects, top-left + bottom-right corners, r=0.32, no halo, math verified in the file comment); droplet + both native views rebuilt (eager setRenderEffect in init, no size gate, updateUniforms + Log.d on every size/layout/attach/prop event). tsc clean, zero ensureEffect / LinearGradient / halo left. Uncommitted, build starts only on his "build" command. His 12:39 Logcat screenshot came through 86px wide and unreadable, OCR found nothing.
- **Logcat file 12:42 (logcat_2026-11-11_12-42-13_1_m8jg.txt), read 11 Nov**: covers only 12:36:49-12:36:53, the app resuming, drawing its first frame, taking touches, then going to background. NO RefractionView/DropletRefractionView lines at all. HONEST LIMIT: the views were created at first launch (before this 4-second window), and build 1 only logged when the effect was first set, so this fragment CANNOT prove whether the effect applied at launch. It does prove the app runs and draws without crashing. It also shows a repeated gesture warning on nearly every touch ("Can't cancel already finished gesture", ReactNative) — gestures still worked, minor. The rebuild's logging (every size/layout/attach event logs) will make the next Logcat definitive either way.
- Settings panel (11 Nov): sliders for blur, refraction, droplet magnification, edge light, veil + dark/light mode + background picker, opened from the gear button top-right. The panel is a FIXED overlay outside the background ScrollView, so scrolling the bg never moves it; its own content scrolls inside a capped ScrollView so nothing is cut off on a small screen.
- HONEST FLAG: the BAR's refraction shader math is still the Anivio-adapted AGSL shader (GPL attribution kept in the file); only the droplet lens shader is fully original. If he wants the bar shader rewritten from scratch too, that is a separate job.

## Edge lighting — CORRECTED (Haziq, 11 Nov 2026)
The notes taken on 10 Nov misunderstood this completely. The correct spec, in his words:
- It is a **gradient stroke around the navbar** (a border stroke, not a fill).
- Alpha **1 (brightest) at 2 opposite edges/corners**, for example top-left and bottom-right, **fading to 0 at the adjacent sides**.
- It is **NOT a completely linear fade**. It is brightest at the corners and **quickly fades out**. Along the top edge, roughly **25% light and 75% transparent**: only about a quarter of the edge near the top-left corner is lit, the rest of the top edge is transparent. Same on the bottom edge near the bottom-right corner. There is still a gradient, just a fast falloff from the corners.
- The old versions (top-left bright / bottom-right shadow; top white rim + bottom ambient-colour glow; vertical white-top / accent-bottom gradient) are all WRONG and superseded. Do not build any of them.

## Reference (image-8.png, 11 Nov 2026)
Apple Music liquid glass: a floating pill tab bar (Home, New, Radio, Library + a circular search button) with a now-playing mini-player pill floating above it (album art, song title and artist, play + next buttons). The glass is very clear with a subtle rim, active tab (Home) highlighted in a lighter pill. This is the look to aim for with his own navbar logic.

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

## Edge lighting (Haziq, 10 Nov) — SUPERSEDED 11 Nov, see corrected spec at top
The glass edge catches light on the **top left** and falls to **shadow on the bottom right**. Directional light. The top-left edge is bright/highlighted, the bottom-right edge is darker/shadowed. This is what gives the glass its depth and makes it read as a physical object with a light source.

### The edge lighting game (10 Nov, image-6.png) — SUPERSEDED 11 Nov, see corrected spec at top
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

## Redo (10 Nov, after Haziq rejected build 319f4b0)
Haziq rejected the 319f4b0 build ("revert. this is ass") and it was reverted (commit a44c523). His complaints, and what was redone from scratch:

- **Edge lighting was wrong.** He had said I misunderstood it. The 319f4b0 version used a diagonal gradient with two WHITE spots (top-left and bottom-right). The game (image-6.png) showed the real thing: top edge bright WHITE, bottom edge glowing with the AMBIENT colour (green in that screenshot), exactly opposite, left and right dark. Redone as a vertical gradient: white at 0% (top), transparent 18%-82%, the background photo's accent colour at 100% (bottom). 1px stroke plus a faint 3px halo. The old diagonal code was deleted, not built on. ALL of this was superseded again on 11 Nov: the correct spec is a gradient stroke around the navbar, alpha 1 at two opposite corners (e.g. top-left and bottom-right), fading to 0 at the adjacent sides, NOT linear, brightest at the corners and quickly fading out, roughly 25% of an edge lit near the corner and 75% transparent. See the corrected section at the top of this file.
- **The refraction was not visible on the navbar.** The module was linked and HAS_REFRACTION was true, but the background did not bend at the bar's edges, and the fill setting did nothing. Diagnosis: the shader's uniforms were never set. RuntimeShader uniforms default to 0, so `resolution` was (0,0), the capsule SDF collapsed, `coverage` was 0 for every pixel, and the shader returned transparent everywhere, so only the BlurView showed through (which is why the fill, wired only to the shader's tintMix, did nothing). The old code applied the RenderEffect in the view's init (when width/height are 0) and relied on onSizeChanged alone. Fix: the native view now only applies the effect once it has a real size (ensureEffect, called from onSizeChanged, onLayout and onAttachedToWindow via post), and the component gives the refraction wrapper an EXPLICIT width/height (bar + 48dp) instead of negative-inset layout arithmetic, so its size can never be zero. A Log.d line records the size when the effect is applied, so a Logcat shows whether the uniforms were set. The blur was also lightened (default 80 to 50): a heavy blur washes the backdrop into a smooth wash with no features left for the refraction to bend. Anivio's shader math itself was NOT changed (it is proven); only the wiring around it.
- **The colour fill was a mess.** Reverted. Not re-added. The droplet does not colour icons in this build.
- **The fill setting did nothing.** Removed entirely (fillOpacity, its slider, and its use as tintMix). The shader now uses a FIXED tintMix of 0.30 (the iOS 27 default). The tint COLOUR is separate and follows the mode (dark #1C1C1E / white) via a new tintColor uniform.
- **The one thing done right was the glow inside the bar.** Kept: the touch glow lives inside the bar's overflow-hidden container, clipped to the pill shape, and can never render outside it.
- **Re-added, only where they do not hide the refraction:** dark/light mode (blur tint, veil, pill and refraction tint follow the mode), a legibility veil (default 0.15, deliberately subtle), and the 9 test backgrounds with accent colours. The veil sits between the glass surface and the icons and never touches the blur or the refraction.
- **Kept from the notes:** the droplet only refracts when held (deferred, gated on frame.isHeld, no droplet refraction yet); tapping does not grow the bar, holding does (holdPress: 1 only after 150ms held or 4dp dragged); the droplet enlarges smoothly on approach (approachScale 1 to 1.15, driven by the spring-smoothed position); the droplet is completely clear while the navbar is frostier with the veil, both with refraction.
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
