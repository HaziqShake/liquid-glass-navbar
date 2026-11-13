/**
 * Haziq's own liquid glass navbar. Rewritten from scratch, 12 Nov 2026
 * (build 4).
 *
 * WHAT CHANGED AND WHY. Builds 1-3 put a RenderEffect on an EMPTY
 * native view and expected its shader to sample the backdrop behind
 * the view. Android binds that shader uniform to the view's OWN
 * RenderNode content, never the pixels behind it, so the shader
 * input was transparent and no refraction could ever appear — the
 * blur was real (expo-blur, a different path) but the glass never
 * bent anything, and the droplet rendered as a solid white circle.
 * This build fixes the MECHANISM: one native GlassView that captures
 * the root once per frame into one shared half-resolution bitmap
 * and draws that bitmap through a hardware RenderNode with the AGSL
 * effect, so the shader bends REAL backdrop pixels. See
 * modules/liquid-glass-refraction for the native side.
 *
 * THE GLASS. A floating pill tab bar. The bar is real glass now:
 * the captured backdrop, bent at the rim by the capsule shader
 * (tint fixed at 0.15, build 6) and then blurred in the
 * RenderEffect chain — material FIRST, blur AFTER, so the bend
 * survives. No expo-blur in the bar path anymore — the chain does
 * refraction + blur in one GPU pass, not two. Below API 33 the bar
 * falls back to a plain expo-blur pill, never a crash.
 *
 * THE DROPLET (Haziq's term): a completely transparent, refractive
 * lens, 48dp, resting INSIDE the bar over the active tab. No fill,
 * no tint, no colour, no blur. A lightweight native shader on the
 * droplet magnifies the icons WITHOUT scaling the icon views — the
 * lens does the magnifying, with displacement zero at the exact
 * centre and growing toward the rim, so the middle icon reads
 * clean. (BUILD 10: the droplet no longer lifts or swells on hold
 * — it enlarges in place, magnification only. The icons now scale
 * in sync with the hold magnification; see MagnifiedTabIcon.)
 *
 * BUILD 7 (12 Nov 2026). Clarity: chain blur 6dp -> 3dp, tintMix
 * 0.15 -> 0.10, veil 0.05 -> 0.02. Build 6 on Appetize proved the
 * refraction works and the droplet is a clear lens, but the bar
 * still read frosted/milky — the 6dp post-material blur smeared
 * the whole pill. And the edge light (see EdgeLight below): the
 * stroke was an ellipse, not a capsule, so it never sat on the rim
 * near the corners, and the gradients were centred on the bbox
 * corners instead of the outline corner points — that is why the
 * bottom-right read faint while the top-left borrowed the shader's
 * top-weighted highlight. Both fixed in build 7.
 *
 * BUILD 8 (12 Nov 2026). Two device-check instruments, no look
 * change by default: (1) EXAGGERATED-BEND DIAGNOSTIC — settings
 * gain `bendDiagnostic` (default false); when ON the bar GlassView
 * gets bendScale 3, tripling the shader's coherent displacement
 * (56dp -> 168dp at the rim), so the device check can see whether
 * ANY displacement reaches the screen. Default OFF, shipped look
 * stays at 1.0. (2) HOLD LIFT — the lift SharedValue moved to the
 * DemoScreen (a prop here) so the on-screen debug readout prints
 * it as ground truth; HOLD_LIFT -14 -> -20, HOLD_SWELL 0.18 ->
 * 0.25, so the lift is unmistakable while still reading as
 * "slightly". Code review found no defect capping lift below 1,
 * so the readout settles it on device.
 *
 * BUILD 9 (12 Nov 2026). Haziq tested build 8 on his own phone:
 * edge lighting PERFECT, veil PERFECT (do not touch either). The
 * refraction was "too rainbow and does not bend anything", and the
 * droplet is REBUILT FROM SCRATCH (standing rule), shape only
 * from Anivio's droplet, minus all Anivio animations:
 * - DROPLET SHAPE (Anivio jellyPillPath, shape only): a capsule
 *   spanning ONE TAB SLOT — width = tab slot width, height = bar
 *   height minus 2x4dp inset, corner radius = min(tabWidth,
 *   itemHeight)/2. NOT a 48dp circle. No jelly scaling
 *   (pillScaleX/Y = 1 always), no jelly springs, no rubber
 *   banding: a single soft spring for tab moves only. The hold
 *   swell (a scale transform on the frame) is DELETED — the hold
 *   magnification is optical (the shader), never a view scale.
 * - The droplet renders OVER the navbar AND OVER the icons (its
 *   overlay sits above the icon row now, zIndex 3 vs 2 — builds
 *   5-8 had it below the icons). Because the droplet glass is
 *   opaque inside its capsule, the icon and label it covers are
 *   re-rendered ABOVE the glass inside the droplet frame (one
 *   duplicate per tab, opacity by the same coverage the icon
 *   crossfade uses, so at rest the duplicate is pixel-identical
 *   to the original it covers and there is no seam).
 * - Same edge light as the navbar: the EdgeLight component is
 *   reused on the droplet's capsule outline (same corner-fade
 *   stroke, bright at two opposite corners).
 * - At REST the droplet has NO magnification at all — it is the
 *   same glass as the bar (same refraction + blur). ONLY ON HOLD
 *   does it magnify, UNIFORMLY: one scale factor about the
 *   droplet centre (the shader's magBase), a plain zoomed-in
 *   image, no fisheye, no per-channel split. Holding also drops
 *   the droplet's blur to 0 while keeping the refraction, and
 *   the icon inside the droplet scales uniformly with it (the
 *   duplicate icon's scale follows the same lift value). The
 *   library's radial touch-magnifier warp is NOT used.
 * - Hold lift with hold/drag priority stays; the droplet still
 *   lifts over the bar on hold. The bar shader is the new
 *   library-port model (see GlassView.kt) — the droplet is the
 *   same glass, so it follows the bar's refraction and blur.
 *   (BUILD 10: the lift is REMOVED — see below. The blur-drop on
 *   hold is REMOVED too, and DropletTabDup is REMOVED.)
 *
 * BUILD 10 (12 Nov 2026). Haziq tested build 9 on his own phone:
 * the refraction is RIGHT — do not touch the refraction model,
 * the edge light geometry, or the veil behaviour except for the
 * new defaults. His build 9 criticisms, each addressed:
 * 1. HOLD ENLARGE, NOT FLOAT-UP. Build 9's droplet floated up on
 *    hold; the hold enlarge was not redone. HOLD_LIFT is now 0:
 *    on hold the droplet enlarges IN PLACE (it grows bigger where
 *    it sits) and does NOT float up. The ONLY change on hold is
 *    the magnification — no lift, no frame growth, no blur change.
 * 2. THE DROPLET MUST NOT REMOVE THE BLUR. Build 9 dropped the
 *    droplet blur to 0 on hold; Haziq does not want that. The
 *    droplet keeps the navbar's blur at rest AND on hold, and
 *    keeps the refraction. Only magnification is added on hold
 *    (native: the droplet blur is blurRadiusDp in both states).
 * 3. MAGNIFICATION ON HOLD magnifies whatever is under the
 *    droplet, uniformly (plain zoom, no fisheye, no per-channel
 *    split). Layer order, corrected twice by him: the icons are
 *    BELOW the droplet and the droplet is TOPMOST (above the icon
 *    row). Build 9's DropletTabDup (icon re-rendered ABOVE the
 *    glass inside the droplet frame) is REMOVED. In its place:
 *    (a) the icon UNDER the droplet scales uniformly about the
 *    droplet centre in sync with the hold magnification
 *    (MagnifiedTabIcon on the icon row — same lift value, same
 *    factor M, coverage-weighted so only the covered tab grows);
 *    (b) the icon the user SEES magnifying inside the lens is the
 *    LensTabIcon, rendered inside the droplet frame ABOVE the
 *    glass but BELOW the droplet's edge light, so the rim light
 *    crosses over it and it reads as UNDER the glass, not pasted
 *    on top. WHY (b) EXISTS: the droplet glass is OPAQUE inside
 *    its capsule, so the icon beneath it is hidden wherever the
 *    droplet covers it — scaling the underlying icon alone would
 *    make the active icon INVISIBLE, not magnified. The lens icon
 *    is the equivalent that makes the icon visibly magnify under
 *    the topmost droplet; it uses the same lift-driven uniform
 *    scale as the underlying icon, so the two agree exactly.
 * 4. TAB TRANSITION EASING: the droplet's tab move used an
 *    elastic/spring easing (withSpring). Now exponential in-out:
 *    withTiming + Easing.inOut(Easing.exp), 300ms. No elastic,
 *    no jelly, no rubber banding. (Drag-following is still direct,
 *    unanimated; only the snap-to-tab is eased.)
 * 5. DROPLET ROUNDING matches the navbar: the droplet's corner
 *    radius is the navbar pill's radius minus its inset
 *    (barHeight/2 - DROPLET_INSET), so the droplet reads as the
 *    same pill shape, concentric with the bar — not a
 *    differently-rounded capsule. (Numerically identical to the
 *    old height/2, now expressed as the concentric rule.)
 * 6. NEW DEFAULTS, Haziq's exact numbers: Blur 55, Refraction
 *    0.50, edge light 0.75, Veil 0.50. FLAG: the veil jumps from
 *    0.02 to 0.50 and the refraction halves from 1.00 to 0.50.
 *    Both applied exactly as given (settings defaults AND native
 *    defaults: glow 0.5, blur 3.3dp). The sliders still work from
 *    these defaults. NOTE: refraction 0.50 halves the rim
 *    sheen/highlight; the bend magnitude is gated, not scaled,
 *    by it, so the bend itself is unchanged.
 *
 * EDGE LIGHT: two overlapping pill-outline rects, each stroked 1.5px
 * white, each with its own radialGradient centred on ONE bright
 * corner — the outline's corner point, top-left and bottom-right
 * (see EdgeLight for the geometry). r about 0.32, stops 0% alpha 1,
 * 15% alpha 0.6, 100% alpha 0. No halo rect. Brightness is a
 * function of DISTANCE FROM THE CORNER, nothing else: roughly
 * 25-30% of each adjacent edge is lit and the rest is transparent,
 * with the falloff fastest right at the corner. This cannot form a
 * V — a radial gradient's iso-alpha contours are circles centred on
 * the corner, so each bright region is an isolated blob hugging its
 * corner and the middle is dark.
 *
 * BAR SIZE: driven ONLY by the scroll shrink (labels collapsing).
 * The shrunk bar never grows when switching tabs, and holding never
 * makes the bar big. There is no hold growth and no press scale on
 * the bar.
 *
 * MOTION: the droplet glides between tabs on exponential in-out
 * easing (BUILD 10: was one soft spring — elastic, jelly). No
 * coupled spring engine, no squash and stretch, no rubber
 * banding. Hold is a short timed ramp of the frame growth and the
 * magnification (BUILD 11).
 *
 * BUILD 11 (12 Nov 2026). Three things, on Haziq's build 10
 * verdict (two screenshots) and the need-fit port:
 * 1. SDK 54 FIRST. The demo is downgraded from Expo SDK 57 to
 *    SDK 54 (need-fit's version): expo ~54, RN 0.81.5, reanimated
 *    4.1.x, expo-blur 15, expo-font 14, expo-image-picker 17.
 *    expo-blur 15 has no BlurTargetView and no blurTarget prop
 *    (its BlurView blurs what is behind it directly) and renames
 *    blurMethod to experimentalBlurMethod (no Sdk31Plus variant),
 *    so the below-API-33 fallback drops the target and uses
 *    experimentalBlurMethod="dimezisBlurView". The native glass
 *    never used the target. GlassViewProps.style is now
 *    StyleProp<ViewStyle> (a RegisteredStyle is not a bare
 *    ViewStyle under RN 0.81's types).
 * 2. STRIP CAPTURE. SharedBackdrop captures only the strip
 *    behind the glass — the union of the glass rects + 16dp margin
 *    (mirror-band reach ~11.6dp + 3.3dp blur) — instead of the
 *    full root. The full-root capture was the biggest lag source.
 *    Each GlassView registers its rect in onPreDraw; the bitmap
 *    origin is the strip's top edge and GlassView subtracts it
 *    when mapping its rect, so the bend lands exactly as before.
 *    The debug readout's `cap` size now reads the strip size.
 * 3. DROPLET, REBUILT FROM THE BUILD 10 VERDICT. (a) HOLD GROWS
 *    THE FRAME: on hold the droplet frame itself grows in place
 *    about its centre to 1.15x the CURRENT bar height — expanded
 *    64dp -> 73.6dp (bigger than the full bar), shrunk 50dp ->
 *    57.5dp (bigger than the shrunk bar but below the full bar;
 *    the corrected brief: relative to the CURRENT bar, never an
 *    absolute size above the full bar). Build 10 only magnified
 *    the content while the frame stayed put. No float-up: the
 *    frame's centroid stays on the bar's centreline at every lift
 *    value, because top = (barHeight - height) / 2 by
 *    construction. (b) CONCENTRIC AT REST: the frame is positioned
 *    by its centre from the bar's CURRENT height (so a shrinking
 *    bar re-centres it every frame), height = bar height - 2x4dp
 *    inset, radius = bar radius - inset, uniform inset on all
 *    sides, no protrusion — build 10's top-inset positioning let
 *    it sit high and protrude above the shrunk bar on device.
 *    (c) ICONS CENTRED: the label is absolutely positioned below
 *    the icon, so the icon — not the icon+label group — is dead
 *    on the bar centreline (hence dead on the droplet centreline)
 *    at every label fraction; the label's line box ends at the
 *    droplet's bottom rim. The glass wrapper tracks the same
 *    animated height as the frame, so the shader capsule always
 *    matches it, including on hold.
 *
 * BUILD 12 (13 Nov 2026). Haziq tested build 11 on his phone:
 * the rounding is still not done, holding and sliding is not
 * working, and holding the droplet does not render the navbar
 * behind it, only the icons. The droplet subsystem is REBUILT
 * FROM SCRATCH (standing rule) — geometry, hold, slide, hold
 * rendering — from a root-cause diagnosis, not patched:
 * 1. GEOMETRY. Build 11's "concentric" was geometrically
 *    impossible: a slot-wide capsule centred on an end tab has
 *    its cap centre 4dp off the bar's cap centre, so the outline
 *    gap varies 0->4dp around the cap instead of a uniform 4dp.
 *    The droplet rect is now the bar rect inset 4dp on all sides,
 *    intersected with the tab slot (left = max(4, slotLeft),
 *    right = min(barW - 4, slotRight), top = 4, bottom = barH - 4,
 *    radius = barH/2 - 4). Middle tabs are unaffected; end tabs
 *    are 4dp narrower and their cap centre lands exactly on the
 *    bar's cap centre (uniform 4dp gap at every angle). The
 *    droplet's edge-light aspect is driven from the same live
 *    derived rect (live bar height and lift), not from the static
 *    settings height and the `held` boolean.
 * 2. SLIDE. The three-gesture Exclusive(Simultaneous(longPress,
 *    pan), tap) stack is deleted — it is unchanged since build 10,
 *    when hold worked, and the regression correlates exactly with
 *    the SDK 54 downgrade (RNGH 2.32 -> 2.28, Reanimated 4.5.1 ->
 *    4.1.7), so the composition itself is the suspect. One
 *    Gesture.Pan (maxPointers 1, no minDistance, no activeOffset)
 *    owns the pointer from down to up, Anivio's interaction model
 *    (study only — no Anivio code, no jelly springs, no rubber
 *    banding, no squash/stretch, no glow): begin on down (records
 *    downX/downY and anchors at the LIVE fractional dropletPos,
 *    so grabbing mid-glide cannot jump), drag tracks relatively
 *    (dragStartPos + dx/slot), tap vs drag by movement (< 4dp =
 *    the tab under the finger at down, else snap to
 *    round(dropletPos)), cancel restores the selected tab. The
 *    hold gate is a 150ms withDelay on lift, so a quick tap never
 *    pulses the frame; `held` mirrors lift > 0 on the UI thread.
 *    Tab transition is now 450ms, same Easing.inOut(Easing.exp).
 * 3. HOLD RENDERING. The droplet glass samples a background-only
 *    capture, so on hold it could only ever show the photo and the
 *    re-rendered icon — never the bar. SharedBackdrop now keeps a
 *    SECOND strip bitmap captured with the navbar visible and only
 *    the droplet subtree hidden; the droplet shader mixes
 *    background-only -> bar-included by heldAnim, so at rest it is
 *    pixel-identical to today and on hold it shows the navbar
 *    (veil, edge light, all icons/labels, background through the
 *    bar) magnified uniformly 1.35x. The LensTabIcon fades out as
 *    lift -> 1 (opacity 1 - lift) so the active icon does not
 *    double, and the droplet's own veil fades the same way (the
 *    bar image already carries the bar's veil — keeping the
 *    droplet's would double-darken the held droplet). HOLD_FRAME_
 *    SCALE is 1.20 (was 1.15): expanded hold 76.8dp, shrunk hold
 *    60.0dp (still 4dp below the full bar).
 *    HONEST LIMIT: the bar's own live glass (its refraction/blurs)
 *    cannot be in the software capture — a hardware RenderNode
 *    cannot draw into the software capture canvas, and the glass
 *    views skip drawing during any capture — so the captured bar
 *    image carries the veil, edge light, icons and labels over the
 *    UNBENT photo, and the droplet's own rim bend + 3.3dp chain
 *    blur apply on top of that. The device check must confirm the
 *    held droplet still reads as the navbar magnified.
 *
 * BUILD 13 (13 Nov 2026). Haziq tested build 12 on his phone:
 * four problems, each rebuilt from scratch (standing rule):
 * 1. BLUR AND VEIL STAY ON WHILE HELD. He wants blur and veil on
 *    the droplet at rest but NOT on hold — on hold the droplet is
 *    a clear magnifying lens (this REVERSES his build 9 verdict
 *    that blur stays on hold; the latest instruction stands). The
 *    droplet's blur is now hold-driven in the native chain
 *    (blurRadiusDp * (1 - heldAnim), easing 3.3dp -> 0 over the
 *    existing 200ms hold ramp); the bar keeps its 3.3dp. The
 *    droplet's own veil already faded with lift; the bar's veil
 *    was baked into the bar-included capture, so the native side
 *    now hides the bar's veil View during that capture
 *    (findBarVeil, size+leaf match) and restores it in `finally`.
 * 2. HOLD GROWTH CHANGED THE SHAPE. Build 12 grew only the frame
 *    height to 1.20x the bar height — aspect -27% expanded, -30%
 *    shrunk. The height lerp is DELETED: the layout rect stays at
 *    rest geometry at every lift value, and the hold growth is a
 *    UNIFORM SCALE TRANSFORM (HOLD_SCALE 1.25) about the frame
 *    centre. Held 70.0dp expanded (bigger than the full bar),
 *    52.5dp shrunk (bigger than the shrunk bar, below the full
 *    bar). The shader's hold magnification M is 1.0 now — the
 *    frame scale IS the magnification.
 * 3. TAPPING DID NOT SWITCH TABS. Build 12's single Pan put the
 *    tap branch inside pan.onEnd, which CANNOT run on a real tap:
 *    RNGH calls onEnd only if the handler was ACTIVE, and a Pan
 *    becomes ACTIVE only on pointer movement — a motionless tap
 *    goes BEGAN then FAILS, and onFinalize re-selected the current
 *    tab. The dedicated Gesture.Tap is restored (build 11's tap)
 *    as Gesture.Exclusive(pan, tap), and onFinalize is guarded by
 *    panOwned (set in onStart/onUpdate) so a tap the Tap wins
 *    cannot trigger the Pan's restore.
 * 4. ICONS AND TEXT NOT CENTRED IN THE GROWN DROPLET. The label
 *    hangs below the icon, so a uniform zoom about the centre
 *    pushes it further down while the icon stays put — the held
 *    content's centroid sat ~+10dp below the centre. The fix does
 *    NOT re-render the icon/label above the glass (LensTabIcon is
 *    DELETED — the icons stay below the droplet, seen only through
 *    the glass, never re-rendered above it): the active tab's
 *    icon+label group translates UP 7.5dp x labelFraction x lift
 *    x coverage in the BAR itself (TabContent), so on hold the
 *    group is centred on the droplet centreline, and the at-rest
 *    layout is unchanged. With M = 1.0 and s = 1.25 the held
 *    content sits centred with symmetric ~9.4dp margins.
 * 5. TAMED DROPLET BEND (his extra instruction the same day).
 *    The droplet's refraction bent the icons behind it (the icon's
 *    top edge displaced 4.9dp expanded, 8.4dp shrunk at bend 1.0).
 *    The droplet's bend now runs at DROPLET_BEND_SCALE 0.12x, so
 *    the worst-case icon edge displaces ~1.0dp rendered while the
 *    rim still bends ~1.4-1.7dp and the edge light + sheen keep it
 *    reading as glass. The BAR's refraction is untouched (bendScale
 *    1.0 shipped — confirmed right in build 9).
 *    The droplet now ALWAYS samples the bar-included strip (the
 *    re-rendered icon is gone, so the bar image is the only way the
 *    icons are visible through it at rest too); the second strip is
 *    captured whenever the droplet is shown, not only while held.
 *
 * PERFORMANCE. The glass costs one half-resolution STRIP capture
 * per frame (BUILD 11: the union of the glass rects + 16dp
 * margin, ~145dp tall instead of the ~800dp full root), shared
 * by bar + droplet, and only while the backdrop under a view
 * actually changes — a static screen costs zero capture work
 * (the native side hashes its rectangle and skips). The shader
 * runs only over the pill areas, never fullscreen. Two glass
 * views, one bitmap, one GPU pass each.
 *
 * WORKLET SAFETY: no worklet is ever called synchronously from the
 * JS thread. Gesture callbacks call worklets worklet-to-worklet on
 * the UI thread; selectTab is called from JS only via runOnUI; the
 * selection callback reaches JS only via runOnJS. The scroll handler
 * lives on an Animated.ScrollView in the demo screen, never on a
 * plain ScrollView.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { Defs, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView } from 'liquid-glass-refraction';
import type { NavbarSettings } from '../settings/settings';

/** Native glass needs API 33+ (RuntimeShader). Below that the bar
 *  falls back to a plain expo-blur pill and the droplet is not
 *  rendered at all — a clear lens cannot be faked with a tint, and
 *  a fake would be build 3's solid white circle again. */
const HAS_REFRACTION =
  Platform.OS === 'android' && (Platform.Version as number) >= 33;

/** Fixed bar tint mix. Build 7: 0.10 (was 0.15) — the bar must read
 *  CLEAR with the background visible and bending at the rim, not
 *  frosted grey. */
const TINT_MIX = 0.10;

/** The native shader samples 24dp beyond the pill on every side. */
const OUTSET = 24;

/** BUILD 9: the droplet's vertical inset, Anivio jellyPillPath
 *  (inset = 4.dp): the droplet is a capsule spanning one tab slot,
 *  height = bar height minus 2x4dp, corner radius =
 *  min(tabWidth, itemHeight)/2. NOT a 48dp circle. */
const DROPLET_INSET = 4;
/** BUILD 13 — HOLD SCALE. On hold the droplet frame grows by a
 *  UNIFORM SCALE TRANSFORM about its centre, s = 1.25 (frame
 *  geometry never changes — build 12 grew only the frame HEIGHT
 *  to 1.20x the bar height, which changed the aspect ratio -27%
 *  expanded / -30% shrunk). Size rule, solved against the REST
 *  droplet height: expanded rest 56dp needs 56s > 64 (s > 1.143);
 *  shrunk rest 42dp needs 50 < 42s <= 64 (s in (1.190, 1.524]);
 *  intersection s in (1.19, 1.52]. 1.25 gives held 70.0dp expanded
 *  (bigger than the full bar) and 52.5dp shrunk (bigger than the
 *  shrunk bar, below the full bar). NOT 1.20: shrunk 50.4dp is
 *  only 0.4dp above the shrunk bar, inside dp-to-px rounding
 *  noise. The width scales too (slot x s), so on end tabs the held
 *  droplet protrudes ~7dp past the bar's end caps horizontally —
 *  allowed (the held droplet is unclipped and over the bar by
 *  spec). The frame NEVER floats: its centroid stays on the bar's
 *  centreline at every lift value, because the scale is about the
 *  frame centre. The glass wrapper and edge-light SVG are children
 *  of the frame, so they scale along; the shader's resolution
 *  uniform stays rest-size. The hold magnification is optical no
 *  more: the shader's M is 1.0 now (see settings) and this frame
 *  scale IS the magnification. */
const HOLD_SCALE = 1.25;
/** BUILD 13 — GROUP SHIFT. The icon+label group's span midpoint
 *  sits 7.5dp below the bar centreline at full labels (icon top
 *  -13dp, label text bottom +28dp), so a uniform zoom about the
 *  centre pushes the label out of the held droplet. The active
 *  tab's icon+label group translates UP by this much, scaled by
 *  labelFraction and lift and the tab's coverage — at rest (lift 0)
 *  the bar layout is exactly as before; on hold the group is
 *  centred on the droplet centreline, so the held content is
 *  centred and inside with symmetric margins. The shift is
 *  invisible in the live bar: the active tab is covered by the
 *  droplet at every lift value (the shifted span, -20.5..+20.5dp,
 *  stays inside the droplet's current half-height, 28..35dp). */
const GROUP_SHIFT_DP = 7.5;
/** How far the droplet lifts above the bar while held, in dp.
 *  BUILD 10: 0 — REMOVED. Build 9's droplet floated up on hold
 *  and Haziq wants the hold ENLARGE redone instead: on hold the
 *  droplet enlarges in place and does NOT float up. BUILD 11:
 *  there is no lift term at all anymore — the hold enlarge is the
 *  FRAME growing about the bar's centreline (HOLD_FRAME_SCALE,
 *  dropletFrameStyle), and the constant below is deleted with it
 *  rather than kept at 0. `lift` is still the hold progress
 *  (0..1): it drives the frame growth AND the magnification, and
 *  the debug readout still prints it. */

/** Icon size in dp; the label is 16dp tall when shown. */
const ICON_DP = 26;
const LABEL_DP = 16;

export interface LiquidTabItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string; weight: 'fill' | 'regular' }>;
}

export interface LiquidNavbarProps {
  tabs: LiquidTabItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** 1 = labels shown, 0 = labels collapsed. Driven by the demo
   *  screen's scroll handler. This is the ONLY thing that sizes the
   *  bar. */
  labelFraction: SharedValue<number>;
  /** BUILD 11 (SDK 54): the blurTarget prop is DELETED. expo-blur
   *  15 (SDK 54) has no BlurTargetView and no blurTarget prop —
   *  its BlurView blurs what is behind it directly. The fallback
   *  below API 33 now uses experimentalBlurMethod="dimezisBlurView"
   *  with no target. The native glass never used this ref. */
  /** 0 = droplet resting over the active tab, 1 = held. Owned by
   *  the DemoScreen (created there) so its 1s debug poll can read
   *  it — the on-screen readout prints the hold progress as ground
   *  truth for the device check. BUILD 10: `lift` is the hold
   *  PROGRESS now, not a lift distance: it drives the hold
   *  magnification, in the shader (via `held`) and in the icons.
   *  BUILD 11: it also drives the hold FRAME growth
   *  (dropletRectFor). BUILD 12: the 150ms hold gate is a
   *  withDelay on lift, and `held` mirrors lift. BUILD 13: lift
   *  drives the uniform frame SCALE (dropletFrameStyle), the
   *  blur/veil fades (native heldAnim, dropletVeilStyle) and the
   *  icon+label group shift (TabContent); the shader's
   *  magnification is 1.0. */
  lift: SharedValue<number>;
  settings: NavbarSettings;
}

/**
 * The edge light.
 *
 * BUILD 7 — TWO GEOMETRY BUGS, both found by measuring the stroke
 * against the pill instead of trusting the sim (build 5's sim
 * modelled the stroke as following the capsule, which the SVG did
 * NOT do, so it measured "symmetric 0.52" while the device showed
 * a faint bottom-right):
 *
 * 1. The stroke did not follow the pill. viewBox "0 0 100 100"
 *    with a 98x98 rect, rx=49, is a CIRCLE in viewBox space; with
 *    preserveAspectRatio="none" stretched over a ~5.8:1 pill it
 *    renders as a wide flat ELLIPSE, not a capsule. The ellipse
 *    only touches the rim at the extreme points; near the ends it
 *    runs up to ~15dp INSIDE the glass, and it never passes
 *    through the bright part of the corner gradients — the
 *    brightest alpha anywhere on the actual stroke was ~0.22, a
 *    faint streak inside the glass, not a rim light. What read as
 *    a "bright top-left rim" on device was mostly the shader's own
 *    top-weighted highlight (upperLight 1.0 at the top, 0.18 at
 *    the bottom), which is why the bottom-right — no shader boost
 *    — read faint. The two gradients were symmetric; the SHADER
 *    is not, and the stroke was not on the rim at either corner.
 *    FIX: the viewBox now has the bar's own aspect (width =
 *    aspect * 100, Rect w = aspect * 100 - 2, h = 98, rx = 49),
 *    so in viewBox space the rect IS a capsule and the stretch
 *    maps it to a capsule on screen. The aspect is the bar's rest
 *    aspect (screenWidth * barWidthPct / barHeight); when shrunk
 *    the aspect drops ~10% and the stroke sits ~2-3dp inside the
 *    rim at the caps — acceptable, the light matters at rest.
 *
 * 2. The gradients were centred on the bbox CORNER (0,0)/(1,1),
 *    but the pill outline's corner point is inset from the bbox
 *    corner by the cap radius: the outline point nearest the bbox
 *    corner is the 45-degree point of the end cap, at bbox
 *    (0.025, 0.146) for a ~5.8:1 pill. Centred on the bbox corner,
 *    that outline point sat at 46% of the gradient radius and only
 *    ever got alpha ~0.38. FIX: each gradient is centred ON its
 *    outline corner point (TL (0.025, 0.146), BR (0.975, 0.854)),
 *    so the corner itself gets alpha 1 at both ends, fading along
 *    the adjacent edges to ~0 by 30% of the edge — roughly 25-30%
 *    of each adjacent edge lit, the rest transparent, falloff
 *    fastest right at the corner. Brightness is a function of
 *    DISTANCE FROM THE CORNER, nothing else, so this cannot form
 *    a V — a radial gradient's iso-alpha contours are circles
 *    centred on the corner, so each bright region is an isolated
 *    blob hugging its corner and the middle is dark.
 */
function EdgeLight({ intensity, aspect }: { intensity: number; aspect: number }): React.JSX.Element {
  const vbW = Math.round(aspect * 100);
  // Outline corner point: the 45-degree point of the end cap. Cap
  // centre is (50, 50) in viewBox coords (Rect x=1, rx=49); the
  // corner is centre minus 49/sqrt(2) in both axes = (15.36, 15.36).
  // In bbox units (bbox x in [1, vbW-1], y in [1, 99]):
  // cx = 14.36 / (vbW - 2), cy = 14.36 / 98 = 0.1465.
  const cx = 14.36 / (vbW - 2);
  const cy = 14.36 / 98;
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${vbW} 100`} preserveAspectRatio="none">
      <Defs>
        <RadialGradient
          id="liquid-edge-tl"
          cx={cx}
          cy={cy}
          r="0.32"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="15%" stopColor="#FFFFFF" stopOpacity={0.6} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id="liquid-edge-br"
          cx={1 - cx}
          cy={1 - cy}
          r="0.32"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="15%" stopColor="#FFFFFF" stopOpacity={0.6} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* One pill outline per bright corner. Each gradient is
          transparent everywhere except near its own corner, so the
          two strokes never add up into a band between them. */}
      <Rect
        x={1}
        y={1}
        width={vbW - 2}
        height={98}
        rx={49}
        fill="none"
        stroke="url(#liquid-edge-tl)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        opacity={intensity}
      />
      <Rect
        x={1}
        y={1}
        width={vbW - 2}
        height={98}
        rx={49}
        fill="none"
        stroke="url(#liquid-edge-br)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        opacity={intensity}
      />
    </Svg>
  );
}

/**
 * BUILD 12 — the droplet's edge light, with its aspect driven from
 * the SAME live derived rect as the frame (live bar height and
 * lift). Build 11 computed the aspect from the static settings
 * barHeight (64) and the React `held` boolean: on the shrunk bar
 * the true aspect is slot/42 ≈ 1.54 vs the computed 92.5/56 ≈
 * 1.65, and during the hold ramp the aspect was still the rest
 * value while the frame was mid-growth.
 *
 * WHY React state, not animated SVG props: react-native-svg parses
 * `viewBox` in JS (extractViewBox) into native vbWidth/vbHeight
 * props, so an animated `viewBox` prop would never reach the
 * native view — the JS render has to re-run. This component
 * therefore mirrors the derived aspect into React state via a
 * UI-thread reaction, rounded to 0.01 so a 300ms shrink or 180ms
 * hold ramp costs a handful of re-renders of just this small SVG,
 * not the navbar. The aspect only ever changes while the bar is
 * shrinking/growing or the droplet is held; at rest it is static.
 */
function DropletEdgeLight({
  aspectSv,
  intensity,
}: {
  aspectSv: SharedValue<number>;
  intensity: number;
}): React.JSX.Element {
  const [aspect, setAspect] = useState(aspectSv.value);
  useAnimatedReaction(
    () => aspectSv.value,
    (v, prev) => {
      if (prev === null) return;
      const rounded = Math.round(v * 100) / 100;
      if (rounded !== Math.round(prev * 100) / 100) {
        runOnJS(setAspect)(rounded);
      }
    },
    [aspectSv],
  );
  return <EdgeLight intensity={intensity} aspect={aspect} />;
}

/**
 * BUILD 12 — the droplet rect, from scratch. One shared rule, so
 * the frame, its glass wrapper and the edge light can never
 * disagree:
 *
 *   The droplet rect is the BAR rect inset DROPLET_INSET (4dp) on
 *   all sides, intersected with the tab slot: left = max(4,
 *   slotLeft), right = min(barW - 4, slotRight), top = 4, bottom =
 *   barH - 4, height = barH - 8. Middle tabs are unaffected (their
 *   slot rect already sits inside the inset bar); end tabs become
 *   4dp narrower, and their cap centre lands EXACTLY on the bar's
 *   cap centre — a uniform 4dp outline gap at every angle, which a
 *   slot-width capsule centred on its tab cannot have (build 11's
 *   failure: cap centres 4dp apart, gap 0dp at the centreline, 4dp
 *   at top/bottom).
 *
 *   BUILD 13: the rect is the REST geometry at EVERY lift value —
 *   there is no height lerp anymore. On hold the frame grows by a
 *   UNIFORM SCALE TRANSFORM about its centre (HOLD_SCALE 1.25, in
 *   dropletFrameStyle), so the aspect ratio never changes; the
 *   layout rect never changes. Radius is height / 2, which IS
 *   barH/2 - 4, the concentric rule.
 *
 *   Consequence to know about: on end tabs the droplet centre
 *   shifts ~2dp off the tab centre (frame left 4 vs 0). The icon
 *   stays centred on the tab; the shader magnification centre is
 *   the frame centre. At 1.25x frame scale that 2dp offset shifts
 *   the magnified icon by ~0.5dp — negligible, the prescribed cost
 *   of concentricity.
 */
function dropletRectFor(
  barW: number,
  barH: number,
  pos: number,
  tabCount: number,
): { left: number; width: number; height: number; top: number } {
  'worklet';
  const slot = barW / tabCount;
  const slotLeft = pos * slot;
  const slotRight = slotLeft + slot;
  const left = Math.max(DROPLET_INSET, slotLeft);
  const right = Math.min(barW - DROPLET_INSET, slotRight);
  const height = barH - DROPLET_INSET * 2;
  return { left, width: right - left, height, top: DROPLET_INSET };
}

/**
 * BUILD 13 — one tab's icon + label, ON THE ICON ROW, below the
 * droplet. There is NO re-rendered icon above the droplet glass
 * anymore (LensTabIcon is deleted): the icons stay below the
 * droplet and are seen only through the glass, via the
 * bar-included second-strip capture, which the droplet samples at
 * rest as well as on hold. The icon does NOT scale (the frame
 * scale IS the hold magnification — scaling the icon as well
 * would double-magnify it in the capture), and the label does NOT
 * scale either.
 *
 * The ONE thing this component does on hold is the GROUP SHIFT
 * (GROUP_SHIFT_DP, 7.5dp): the icon+label group's span midpoint
 * sits 7.5dp below the bar centreline at full labels, so a uniform
 * zoom about the centre would push the label out of the held
 * droplet. The active tab's icon and label translate UP together
 * by 7.5dp x labelFraction x lift x coverage, so on hold the group
 * is centred on the droplet centreline and the held content sits
 * centred and inside with symmetric margins. At rest (lift 0) the
 * shift is exactly 0 and the bar layout is unchanged. The shift is
 * invisible in the live bar: the active tab is covered by the
 * droplet at every lift value. Only the covered tab shifts
 * (coverage fades to 0 a full slot away), so neighbouring tabs
 * never move.
 */
function TabContent({
  tab,
  index,
  dropletPos,
  lift,
  labelFraction,
  color,
  weight,
}: {
  tab: LiquidTabItem;
  index: number;
  dropletPos: SharedValue<number>;
  lift: SharedValue<number>;
  labelFraction: SharedValue<number>;
  color: string;
  weight: 'fill' | 'regular';
}): React.JSX.Element {
  const Icon = tab.icon;
  const shiftStyle = useAnimatedStyle(() => {
    const coverage = Math.max(0, 1 - Math.abs(index - dropletPos.value));
    return {
      transform: [
        {
          translateY:
            -GROUP_SHIFT_DP * labelFraction.value * lift.value * coverage,
        },
      ],
    };
  });
  const labelStyle = useAnimatedStyle(() => {
    const coverage = Math.max(0, 1 - Math.abs(index - dropletPos.value));
    return {
      height: LABEL_DP * labelFraction.value,
      opacity: labelFraction.value,
      transform: [
        {
          translateY:
            -GROUP_SHIFT_DP * labelFraction.value * lift.value * coverage,
        },
      ],
    };
  });
  return (
    <>
      <Animated.View style={shiftStyle}>
        <Icon size={ICON_DP} color={color} weight={weight} />
      </Animated.View>
      <Animated.View style={[styles.labelWrap, labelStyle]}>
        <Text style={[styles.label, { color }]}>{tab.label}</Text>
      </Animated.View>
    </>
  );
}

export function LiquidNavbar({
  tabs,
  selectedIndex,
  onSelect,
  labelFraction,
  lift,
  settings,
}: LiquidNavbarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // Screen width as a shared value, so the bar's derived width updates
  // on rotation. A plain captured number would go stale inside the
  // derived values below, which only re-run when a shared value they
  // read changes.
  const screenWidthSv = useSharedValue(screenWidth);
  useEffect(() => {
    screenWidthSv.value = screenWidth;
  }, [screenWidth, screenWidthSv]);

  // Bar size constants. These never change at runtime; only the scroll
  // shrink (labelFraction) moves the bar between them.
  const fullHeight = settings.barHeight;
  const shrunkHeight = settings.shrunkHeight;

  // Droplet position in tab units (0 = first tab, 3 = last tab). Keeping
  // it in tab units means a shrinking bar keeps the droplet centred on
  // its tab automatically — the slot width is derived from the live bar
  // width below.
  const dropletPos = useSharedValue(selectedIndex);
  // 0 = resting over the active tab, 1 = held (magnified in place).
  // Owned by the DemoScreen (a prop), so the debug readout can
  // print the hold progress — build 8 ground truth for the hold.

  // BUILD 9: the droplet's hold state, as React state. The lift
  // SharedValue drives the hold magnification on the UI thread;
  // this boolean mirrors it for the droplet GlassView's `held`
  // prop. The native side eases the droplet's magnification 1 ->
  // M over ~200ms itself. BUILD 10: the blur does NOT drop on hold
  // anymore — magnification only.
  //
  // BUILD 12: `held` mirrors the lift SharedValue (lift > 0) via a
  // UI-thread reaction, NOT via runOnJS calls inside the gestures.
  // The hold gate is a 150ms withDelay on lift (see the Pan
  // gesture below), so lift stays exactly 0 through a quick tap
  // and this reaction never fires — a tap cannot pulse the
  // magnification. On release lift ramps to 0 over 220ms and `held`
  // flips false only when lift reaches exactly 0, so the native
  // heldAnim eases 1 -> 0 over its own 200ms after the frame has
  // shrunk back.
  const [held, setHeld] = useState(false);
  useAnimatedReaction(
    () => lift.value > 0,
    (v, prev) => {
      if (prev !== null && v !== prev) {
        runOnJS(setHeld)(v);
      }
    },
    [lift],
  );

  // Bar size, driven ONLY by the scroll shrink. Nothing else — no tab
  // switch, no hold — ever changes the bar's size.
  const barWidth = useDerivedValue(() => {
    const full = screenWidthSv.value * settings.barWidthPct;
    const shrunk = full * settings.shrunkWidthPct;
    return full - (full - shrunk) * (1 - labelFraction.value);
  });
  const barHeight = useDerivedValue(() => {
    return fullHeight - (fullHeight - shrunkHeight) * (1 - labelFraction.value);
  });

  // Snap the droplet to a tab with exponential in-out easing
  // (BUILD 10: was a withSpring — elastic, jelly. Haziq wants
  // exponential in-out, no elastic, no jelly, no rubber banding).
  // withTiming + Easing.inOut(Easing.exp), BUILD 12: 450ms (was
  // 300ms — Haziq said the exponential easing was a bit too fast
  // on 13 Nov; same curve, slower). The droplet eases out of the
  // old tab, cruises, and eases into the new one, with no
  // overshoot past the target — a spring always overshoots and
  // settles back, which is the jelly feel. Worklet: called
  // worklet-to-worklet from gestures, and from JS only via
  // runOnUI. The selection callback reaches JS only via runOnJS —
  // never a synchronous worklet call from the JS thread.
  const selectTab = useCallback(
    (index: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(tabs.length - 1, Math.round(index)));
      dropletPos.value = withTiming(clamped, {
        duration: 450,
        easing: Easing.inOut(Easing.exp),
      });
      runOnJS(onSelect)(clamped);
    },
    [tabs.length, dropletPos, onSelect],
  );

  // Keep the droplet in step if the parent changes the selection.
  useEffect(() => {
    runOnUI(selectTab)(selectedIndex);
  }, [selectedIndex, selectTab]);

  // BUILD 13 — PAN + TAP, NO GESTURE ARBITRATION BEYOND THAT.
  // Build 12's single-Pan model is DELETED as the tap path: its
  // diagnosis was WRONG. The regression does NOT correlate with the
  // SDK 54 downgrade (RNGH 2.32 -> 2.28) — the mechanism is
  // version-independent, and build 11 worked because it HAD a Tap
  // gesture. From the installed RNGH 2.28.0 source
  // (gesture.js:93-96), onEnd is called ONLY if the handler was
  // previously ACTIVE, and a Pan becomes ACTIVE only on pointer
  // movement (minDistance / activeOffset; build 12 set neither, so
  // the native default applies and movement is required in any
  // case). A pure tap produces no move event: the handler goes
  // BEGAN (onBegin fires, arming the 150ms lift gate), then FAILS
  // on pointer-up. onEnd never runs; only onFinalize runs
  // (gesture.js:109-111), and build 12's onFinalize treated every
  // non-ended gesture as a cancel and re-selected the current tab.
  // Net effect on device: tapping another tab did nothing and the
  // droplet glided back. The file's own build 12 comment ("no
  // minDistance, no activeOffset — it must receive the down event")
  // confused receiving down (BEGAN) with activation (ACTIVE). No
  // minDistance value can fix it: a motionless tap has no move
  // event, so it must be a Tap gesture (or onTouchesUp).
  //
  // Interaction model, from studying Anivio (study only — no
  // Anivio code is copied and its look/feel is NOT revived):
  // FloatingNavigationBar.android.kt has a single awaitEachGesture
  // loop (awaitFirstDown -> begin() -> drag loop -> finish() /
  // cancel()); JellyMotion.kt has begin/drag/finish/cancel with NO
  // springs in the interaction path (the springs are the banned
  // animation — replaced here by withTiming + Easing.inOut
  // (Easing.exp), 450ms). ADOPTED, rebuilt on Reanimated/RNGH:
  //   (1) One Gesture.Pan (maxPointers 1, no minDistance, no
  //       activeOffset — it must receive the down event, as
  //       Anivio's awaitFirstDown(requireUnconsumed = false)
  //       does) owns the pointer from down to up for DRAGS and
  //       HOLDS. A dedicated Gesture.Tap owns TAPS (build 11's
  //       tap, restored): Gesture.Exclusive(pan, tap) — if the
  //       finger moves, the Pan activates first and the Tap fails;
  //       if it does not move, the Tap activates on pointer-up and
  //       selects the tab under the finger.
  //   (2) Begin on down: records downX/downY, anchors at the LIVE
  //       fractional dropletPos (Anivio anchors at indexAt(downX)
  //       because its pill is always on a tab; ours anchors at the
  //       live position so grabbing mid-glide cannot jump), and
  //       arms the hold gate (below).
  //   (3) Drag tracks the finger RELATIVELY: dragStartPos + dx /
  //       slot, direct unanimated writes. (The old absolute
  //       event.x / slot - 0.5 jumped if the slot width changed
  //       mid-drag as the bar shrank; the relative form is robust
  //       to that.)
  //   (4) Tap vs drag by MOVEMENT, not by separate gestures alone:
  //       the Tap's onEnd selects the tab under the finger
  //       (indexAt); the Pan's onEnd snaps to round(dropletPos).
  //       The Pan's onEnd keeps its < 4dp tap branch as a fallback
  //       for the edge case where the Pan activates on a tiny
  //       movement — it cannot run on a real tap (see above).
  //   (5) Cancel restores: onFinalize with no onEnd (interrupted)
  //       re-selects the selected tab and drops lift — but ONLY
  //       when the Pan actually owned the pointer (panOwned, set
  //       in onStart/onUpdate). A tap the Tap gesture wins also
  //       fires the Pan's onFinalize (the Pan failed); without the
  //       guard it would re-select the current tab and fight the
  //       tap. The old code had no position restore — a cancelled
  //       drag stranded the droplet mid-way. (Anivio's finally {
  //       if (!finished) motion.cancel(selectedIndex) }.)
  //   (6) Multi-touch guard: maxPointers(1) — a second finger
  //       fails the gesture, onFinalize restores, nothing selects.
  // HOLD within the Pan model (no LongPress gesture):
  // onBegin arms lift with withDelay(150, withTiming(1, 180ms));
  // onEnd/onFinalize assign lift -> 0, which cancels a
  // still-pending delayed ramp. The 150ms hold gate is preserved
  // (a quick tap does not pulse the frame — the old pan.onBegin
  // fired lift on EVERY touch-down including taps), while a drag
  // keeps lift at 1 for its duration, as before. `held` follows
  // lift via the reaction above.
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);
  const dragStartPos = useSharedValue(0);
  const dragStartSlot = useSharedValue(0);
  const movedDistance = useSharedValue(0);
  const gestureEnded = useSharedValue(false);
  // BUILD 13: true only once the Pan actually became ACTIVE
  // (onStart/onUpdate) — a tap never activates it, so the Pan's
  // onFinalize must not restore on a tap the Tap gesture wins.
  const panOwned = useSharedValue(false);

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onBegin((event) => {
      'worklet';
      downX.value = event.x;
      downY.value = event.y;
      dragStartPos.value = dropletPos.value;
      // Capture the slot width at drag start: the bar can shrink
      // mid-drag (a scroll-shrink in flight when the finger goes
      // down), and the relative drag must divide by the slot the
      // drag started with — dividing by the LIVE slot would jump
      // the position by dx * (1/newSlot - 1/oldSlot) when it
      // changes. The droplet's pixel position still tracks the
      // live bar width (dropletRectFor reads barWidth live), so
      // the droplet glides smoothly as the bar narrows.
      dragStartSlot.value = barWidth.value / tabs.length;
      movedDistance.value = 0;
      gestureEnded.value = false;
      panOwned.value = false;
      // Arm the hold gate: lift stays 0 for 150ms, then ramps to
      // 1 over 180ms. Assigning lift -> 0 on release cancels a
      // still-pending delayed ramp, so a quick tap never lifts.
      lift.value = withDelay(
        150,
        withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
      );
    })
    .onStart(() => {
      'worklet';
      // The Pan is ACTIVE now: it owns the pointer (movement
      // happened). Only from here may onFinalize restore.
      panOwned.value = true;
    })
    .onUpdate((event) => {
      'worklet';
      panOwned.value = true;
      const dx = event.x - downX.value;
      const dy = event.y - downY.value;
      movedDistance.value = Math.max(
        movedDistance.value,
        Math.max(Math.abs(dx), Math.abs(dy)),
      );
      // Relative drag: the droplet follows the finger from where
      // it was grabbed, with zero jump at the first move, dividing
      // by the slot captured at drag start (see onBegin).
      const next = dragStartPos.value + dx / dragStartSlot.value;
      dropletPos.value = Math.max(0, Math.min(tabs.length - 1, next));
    })
    .onEnd(() => {
      'worklet';
      gestureEnded.value = true;
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      if (movedDistance.value < 4) {
        // Fallback only: onEnd runs only if the Pan was ACTIVE,
        // which needs movement — a real tap never reaches here
        // (the Tap gesture owns it). If the Pan activated on a
        // tiny movement, select the tab under the finger at down,
        // in the geometry at down time (the slot captured at drag
        // start).
        const index = Math.floor(downX.value / dragStartSlot.value);
        selectTab(Math.max(0, Math.min(tabs.length - 1, index)));
      } else {
        // Drag: snap to the nearest tab.
        selectTab(Math.round(dropletPos.value));
      }
    })
    .onFinalize(() => {
      'worklet';
      // onFinalize also runs after a completed onEnd, and after a
      // FAILED Pan — including every tap the Tap gesture wins.
      // The flags keep the restore for the interrupted-drag case
      // only: not after onEnd, and not when the Pan never owned
      // the pointer.
      if (gestureEnded.value || !panOwned.value) return;
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      // Cancelled mid-drag: the droplet glides back to the
      // selected tab instead of stranding mid-way.
      selectTab(selectedIndex);
    });

  // BUILD 13: the dedicated Tap gesture (build 11's tap, restored).
  // A Pan's onEnd cannot run on a real tap — onEnd fires only if
  // the handler was ACTIVE, and a motionless tap never activates a
  // Pan — so the tap MUST be its own gesture. Do NOT try
  // .minDistance(0) on the Pan instead: a motionless tap has no
  // move event, so no minDistance value can activate it.
  const tap = Gesture.Tap().onEnd((event) => {
    'worklet';
    const slot = barWidth.value / tabs.length;
    selectTab(Math.floor(event.x / slot));
  });

  // Exclusive: the Pan wins on movement (the Tap fails), the Tap
  // wins on a motionless pointer-up (the Pan fails). One of them
  // always owns the release — never both, never neither.
  const gestures = Gesture.Exclusive(pan, tap);

  const barWrapStyle = useAnimatedStyle(() => ({
    width: barWidth.value,
    height: barHeight.value,
  }));
  const barStyle = useAnimatedStyle(() => ({
    borderRadius: barHeight.value / 2,
  }));
  // The bar glass WRAPPER (a regular host view) carries the animated
  // size — bar + 48dp, so its size can never be zero. The native
  // GlassView inside it takes StyleSheet.absoluteFill only and NEVER
  // receives animated layout props: animated width/height applied
  // directly to a custom native view never produced a real layout
  // size on device (build 2), so the native view is sized by Yoga
  // layout through the wrapper instead.
  const barGlassWrapStyle = useAnimatedStyle(() => ({
    width: barWidth.value + OUTSET * 2,
    height: barHeight.value + OUTSET * 2,
  }));

  // THE DROPLET, BUILD 13 (rebuilt from scratch — geometry, hold,
  // slide, hold rendering, bend — from the build 12 diagnosis).
  // Anivio's shape, shape only: a capsule spanning ONE TAB SLOT,
  // centred on the BAR's centreline (not on the icon). No jelly
  // scaling (pillScaleX/Y = 1 always), no jelly springs, no rubber
  // banding: the frame only translates (tab position) and scales
  // uniformly (hold). The frame is positioned BY ITS TOP-LEFT from
  // ONE shared rect (dropletRectFor, above): the bar rect inset
  // 4dp on all sides intersected with the tab slot — top = 4, never
  // a centre-derived top that could sit high and protrude above
  // the shrunk bar (build 10's failure) and never a slot-wide
  // capsule whose cap centre misses the bar's (build 11's
  // failure). The rect is the REST geometry at every lift value:
  // on HOLD the frame grows by a UNIFORM SCALE TRANSFORM about its
  // centre (HOLD_SCALE 1.25, in dropletFrameStyle below), with NO
  // float-up and NO shape change — the aspect ratio is identical
  // at rest and held. The shader's magnification is 1.0 now (the
  // frame scale IS the magnification); the icons are seen only
  // through the glass, via the bar-included capture the droplet
  // always samples — nothing is re-rendered above the glass. On
  // hold the droplet's blur eases to 0 and its veil fades to 0, so
  // it is a clear magnifying lens, and its bend runs at 0.12x so
  // the icons stay clean. At rest the droplet is the same glass as
  // the bar (same refraction + blur).
  //
  // BUILD 13 — one shared rect, so the frame, its glass wrapper
  // and the edge light can never disagree. The radius is height /
  // 2 (that IS barH/2 - 4, the concentric rule). The outline is a
  // capsule at every step, and the hold scale keeps it one.
  const dropletRect = useDerivedValue(() =>
    dropletRectFor(barWidth.value, barHeight.value, dropletPos.value, tabs.length),
  );
  const dropletFrameStyle = useAnimatedStyle(() => {
    const rect = dropletRect.value;
    // BUILD 13: the hold growth is a UNIFORM SCALE about the frame
    // centre (RN transforms originate at the view centre), NOT a
    // height lerp — build 12's height-only growth changed the
    // aspect ratio -27%/-30%. The layout (width/height/top/left)
    // never changes; only this transform grows, 1 -> 1.25 with
    // lift. The glass wrapper and edge light are children of the
    // frame, so they scale along; the shader's resolution uniform
    // stays rest-size.
    const scale = 1 + (HOLD_SCALE - 1) * lift.value;
    return {
      width: rect.width,
      height: rect.height,
      borderRadius: rect.height / 2,
      transform: [{ translateX: rect.left }, { translateY: rect.top }, { scale }],
    };
  });
  // The droplet glass wrapper: droplet frame + 48dp, at -24dp,
  // so the shader's 24dp `outset` region is available and the
  // frame clips it to the capsule — same arrangement as the bar.
  // The wrapper tracks the SAME derived rect as the frame, so the
  // shader's capsule always matches the frame; on hold the frame's
  // scale transform grows the wrapper along with it.
  const dropletGlassWrapStyle = useAnimatedStyle(() => {
    const rect = dropletRect.value;
    return {
      width: rect.width + OUTSET * 2,
      height: rect.height + OUTSET * 2,
    };
  });
  // BUILD 12 — the droplet edge-light aspect, from the same live
  // derived rect as the frame (live bar height). BUILD 13: the
  // rect is rest geometry at every lift value, so the aspect is
  // constant through the hold — the uniform frame scale preserves
  // it (build 12's height-only growth changed it mid-hold). See
  // DropletEdgeLight: the reaction mirrors it into React state.
  const dropletAspectSv = useDerivedValue(() => {
    const rect = dropletRect.value;
    return rect.width / rect.height;
  });
  // BUILD 12 — the droplet's own veil fades out as lift -> 1.
  // BUILD 13: the bar-included capture carries NO veil (the bar's
  // veil View is hidden during that capture), so at rest this veil
  // is the droplet's only veil, and on hold there is no veil
  // inside the droplet at all. At rest lift = 0 and this is
  // exactly the old static veil.
  const dropletVeilStyle = useAnimatedStyle(() => ({
    opacity: settings.legibilityVeil * (1 - lift.value),
  }));

  const dark = settings.mode === 'dark';
  const tintColor: [number, number, number] = dark
    ? [28 / 255, 28 / 255, 30 / 255]
    : [1, 1, 1];
  const iconActive = dark ? '#FFFFFF' : '#111111';
  const iconInactive = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
  const veilColor = dark ? '#000000' : '#FFFFFF';
  const fallbackFill = dark ? 'rgba(28,28,30,0.3)' : 'rgba(255,255,255,0.3)';
  // Blur setting (0-100) maps to the chain blur radius: build 10,
  // 55 -> 3.3dp (was 50 -> 3dp). The 6dp post-material blur smeared
  // the whole pill milky on device; a lighter blur keeps the
  // background's detail so the rim bend stays visible. The bend
  // (up to ~11dp at the rim) still dwarfs a 3.3dp blur. The slider
  // still works.
  const blurRadiusDp = settings.barBlur * 0.06;
  // The edge light's viewBox must have the bar's rest aspect, so
  // the SVG rect is a capsule on screen (see EdgeLight). At rest
  // the bar is screenWidth * barWidthPct wide and barHeight tall.
  const barAspect = (screenWidth * settings.barWidthPct) / settings.barHeight;

  return (
    <View style={[styles.root, { bottom: insets.bottom + 16 }]}>
      <Animated.View style={[styles.barWrap, barWrapStyle]}>
        <GestureDetector gesture={gestures}>
          <Animated.View style={styles.bar}>
            {/* The glass container carries the pill clip (overflow
                hidden + animated radius). The bar itself is overflow
                visible, so the held droplet can lift above its
                silhouette instead of being clipped by it. */}
            <Animated.View style={[styles.glassContainer, barStyle]}>
              {HAS_REFRACTION ? (
                <Animated.View style={[styles.glassFill, barGlassWrapStyle]}>
                  <GlassView
                    style={StyleSheet.absoluteFill}
                    mode="bar"
                    glowStrength={settings.refractionStrength}
                    // Build 8 DIAGNOSTIC: bendScale 3 only when the
                    // bendDiagnostic switch is ON, else 1 (shipped
                    // look). Bar only — the droplet shader has no
                    // bendScale and is untouched.
                    bendScale={settings.bendDiagnostic ? 3 : 1}
                    tintMix={TINT_MIX}
                    tintColor={tintColor}
                    blurRadius={blurRadiusDp}
                  />
                </Animated.View>
              ) : (
                <>
                  <BlurView
                    style={StyleSheet.absoluteFill}
                    intensity={settings.barBlur}
                    tint={dark ? 'dark' : 'light'}
                    // BUILD 11 (SDK 54): expo-blur 15 renamed
                    // blurMethod to experimentalBlurMethod and
                    // dropped the Sdk31Plus variant (dimezisBlurView
                    // now covers it) and the blurTarget prop — the
                    // BlurView blurs what is behind it directly.
                    experimentalBlurMethod="dimezisBlurView"
                    blurReductionFactor={1}
                  />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackFill }]} />
                </>
              )}
              <View
                style={[styles.veil, { backgroundColor: veilColor, opacity: settings.legibilityVeil }]}
              />
              <EdgeLight intensity={settings.edgeLight} aspect={barAspect} />
            </Animated.View>
            {/* THE DROPLET, BUILD 13 (rebuilt from scratch): ABOVE
                the icon row (zIndex 3 vs the row's 2) and above the
                bar glass — over the navbar AND over the icons, not
                below the icons as in builds 5-8. The frame is the
                bar rect inset 4dp on all sides intersected with
                the tab slot (Anivio's shape, shape only), holding
                the same glass as the bar. NOTHING is re-rendered
                above the glass inside the frame anymore
                (LensTabIcon is deleted): the icons stay BELOW the
                droplet and are seen only through the glass, via
                the bar-included capture the droplet glass always
                samples — at rest as well as on hold. The edge
                light is the TOPMOST element of the droplet. On
                hold the droplet does NOT lift: the frame grows by
                a UNIFORM SCALE (HOLD_SCALE 1.25) about its centre
                (its layout never changes), its blur eases to 0 and
                its veil fades to 0, so it is a clear magnifying
                lens over the navbar, and its bend runs at 0.12x so
                the icons stay clean. It never intercepts touches. */}
            <Animated.View style={[styles.dropletOverlay, { zIndex: 3 }]} pointerEvents="none">
              <Animated.View style={[styles.dropletFrame, dropletFrameStyle]}>
                {HAS_REFRACTION ? (
                  <Animated.View style={[styles.dropletGlass, dropletGlassWrapStyle]}>
                    <GlassView
                      style={StyleSheet.absoluteFill}
                      mode="droplet"
                      magnification={settings.dropletMagnification}
                      held={held}
                      tintMix={TINT_MIX}
                      tintColor={tintColor}
                      glowStrength={settings.refractionStrength}
                      blurRadius={blurRadiusDp}
                      bendScale={1}
                    />
                  </Animated.View>
                ) : null}
                {/* BUILD 13: the droplet's own veil fades out on
                    hold (dropletVeilStyle). The bar-included
                    capture carries NO veil — the bar's veil View
                    is hidden during that capture — so at rest this
                    veil is the droplet's only veil, and on hold
                    there is no veil inside the droplet at all. */}
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: veilColor },
                    dropletVeilStyle,
                  ]}
                />
                <DropletEdgeLight aspectSv={dropletAspectSv} intensity={settings.edgeLight} />
              </Animated.View>
            </Animated.View>
            <View style={[styles.iconRow, { zIndex: 2 }]}>
              {tabs.map((tab, index) => {
                const active = index === selectedIndex;
                return (
                  <View key={tab.key} style={styles.tabSlot}>
                    {/* BUILD 13: one tab's icon + label, BELOW the
                        droplet (see TabContent). The icon never
                        scales — the frame scale IS the hold
                        magnification — and on hold the active
                        tab's icon+label group shifts up 7.5dp so
                        it sits centred in the held droplet. */}
                    <TabContent
                      tab={tab}
                      index={index}
                      dropletPos={dropletPos}
                      lift={lift}
                      labelFraction={labelFraction}
                      color={active ? iconActive : iconInactive}
                      weight={active ? 'fill' : 'regular'}
                    />
                  </View>
                );
              })}
            </View>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  barWrap: {
    position: 'relative',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Overflow VISIBLE (build 5): the pill clip lives on the glass
    // container now, so the held droplet can lift above the bar.
    overflow: 'visible',
  },
  // The pill clip: overflow hidden + the animated radius. Holds the
  // bar glass, the veil and the edge light — never the droplet or
  // the icons, which sit above it.
  glassContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  // Bar glass wrapper sits 24dp beyond the bar frame on every side.
  glassFill: {
    position: 'absolute',
    left: -OUTSET,
    top: -OUTSET,
  },
  // Droplet glass wrapper: droplet frame (slot x barHeight-8dp)
  // + 48dp, at -24dp. Its width/height come from the animated
  // dropletGlassWrapStyle (the slot and the bar height animate);
  // this style only carries the -24dp offset.
  dropletGlass: {
    position: 'absolute',
    left: -OUTSET,
    top: -OUTSET,
  },
  veil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  iconRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    // BUILD 11 — ICON CENTERING. The label is positioned
    // ABSOLUTELY below the icon (top = slot centre + half the
    // icon height) instead of sitting under it in flow. Before,
    // the icon + label were centred as a GROUP, so the icon sat
    // 8dp above the slot centre (half the 16dp label) while the
    // droplet — centred on the slot — sat on the centreline: the
    // icon was never at the droplet's centre, and as the labels
    // collapsed the icon drifted down toward the centre. Now the
    // icon is dead on the bar centreline (hence dead on the
    // droplet centreline) at every label fraction, and the label
    // hangs below it: its 14dp line box ends right at the
    // droplet's bottom rim (icon bottom at centre + 13dp, label
    // text 14dp tall centred in the 16dp wrap). left/right 0 so
    // the wrap spans the slot and the text stays centred.
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: ICON_DP / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 14,
  },
  dropletOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'visible',
  },
  // BUILD 9: the droplet frame is a slot-width capsule (width,
  // height and borderRadius all come from the animated
  // dropletFrameStyle). Overflow hidden clips the glass wrapper
  // to the capsule; the frame itself is overflow visible to its
  // parent (the overlay), so the hold lift is not clipped.
  dropletFrame: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
});
