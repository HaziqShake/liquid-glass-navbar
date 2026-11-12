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
 * banding. Hold is a short timed ramp of the magnification only.
 *
 * PERFORMANCE. The glass costs one half-resolution root capture per
 * frame, shared by bar + droplet, and only while the backdrop under
 * a view actually changes — a static screen costs zero capture
 * work (the native side hashes its rectangle and skips). The shader
 * runs only over the pill areas, never fullscreen. Two glass views,
 * one bitmap, one GPU pass each.
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
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
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
/** How far the droplet lifts above the bar while held, in dp.
 *  BUILD 10: 0 — REMOVED. Build 9's droplet floated up on hold
 *  and Haziq wants the hold ENLARGE redone instead: on hold the
 *  droplet enlarges in place and does NOT float up. The ONLY
 *  change on hold is the magnification (the shader's uniform zoom
 *  + the icons' matching scale), so the lift term is zero and the
 *  droplet frame stays exactly where it sits. The constant is
 *  kept at 0 (rather than deleting the term) so the removal is
 *  explicit and greppable. `lift` is still the hold progress
 *  (0..1): it now drives only the magnification, and the debug
 *  readout still prints it. */
const HOLD_LIFT = 0;

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
  /** Ref of the BlurTargetView wrapping the demo content. Only used
   *  by the below-API-33 expo-blur fallback; the native glass
   *  captures its own backdrop and never touches this. */
  blurTarget: React.RefObject<View | null>;
  /** 0 = droplet resting over the active tab, 1 = held. Owned by
   *  the DemoScreen (created there) so its 1s debug poll can read
   *  it — the on-screen readout prints the hold progress as ground
   *  truth for the device check. BUILD 10: `lift` is the hold
   *  PROGRESS now, not a lift distance (HOLD_LIFT is 0): it drives
   *  only the hold magnification, in the shader (via `held`) and
   *  in the icons (MagnifiedTabIcon / LensTabIcon). */
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
 * BUILD 10 — the icon of one tab ON THE ICON ROW, magnified with
 * the hold. This is the icon BENEATH the droplet: the droplet is
 * topmost (its glass and rim light sit above this row), and on
 * hold this icon scales uniformly about the droplet centre, in
 * sync with the shader's optical zoom — the same `lift` value and
 * the same factor M. When the droplet is centred on this tab the
 * icon's centre IS the droplet centre, so scaling about its own
 * centre is scaling about the droplet centre; the coverage weight
 * fades the scale to 1 a full slot away, so only the covered tab
 * grows and a distant tab never does. NO translate: the icon's
 * centre stays exactly on its tab centre, so it always coincides
 * with the LensTabIcon's centre and the two can never form a
 * double image at the droplet's edge.
 *
 * The label is NOT scaled (same as build 9): only the icon
 * magnifies.
 */
function MagnifiedTabIcon({
  tab,
  index,
  dropletPos,
  lift,
  holdMagnification,
  color,
  weight,
}: {
  tab: LiquidTabItem;
  index: number;
  dropletPos: SharedValue<number>;
  lift: SharedValue<number>;
  holdMagnification: number;
  color: string;
  weight: 'fill' | 'regular';
}): React.JSX.Element {
  const Icon = tab.icon;
  const iconStyle = useAnimatedStyle(() => {
    const coverage = Math.max(0, 1 - Math.abs(index - dropletPos.value));
    return {
      transform: [{ scale: 1 + (holdMagnification - 1) * lift.value * coverage }],
    };
  });
  return (
    <Animated.View style={iconStyle}>
      <Icon size={ICON_DP} color={color} weight={weight} />
    </Animated.View>
  );
}

/**
 * BUILD 10 — the icon + label of one tab, as seen THROUGH the
 * droplet lens. Rendered inside the droplet frame, ABOVE the
 * glass and the veil but BELOW the droplet's edge light — so the
 * rim light crosses over it and it reads as UNDER the glass, not
 * pasted on top (build 9's DropletTabDup sat above the edge light
 * as well as the glass, which is why it is removed).
 *
 * WHY THIS EXISTS AT ALL. The droplet glass is OPAQUE inside its
 * capsule, so the icon beneath it (MagnifiedTabIcon, above) is
 * hidden wherever the droplet covers it. Scaling the underlying
 * icon alone would therefore make the active icon INVISIBLE on
 * hold, not magnified. This is the equivalent that makes the icon
 * visibly magnify under the topmost droplet: the lens icon uses
 * the SAME lift-driven uniform scale as the underlying icon (same
 * factor M, same coverage weight, same centre), so the two agree
 * exactly wherever they overlap. Opacity follows the same
 * coverage the icon crossfade uses (1 when the droplet is
 * centred on this tab, 0 a full slot away), so a glide
 * crossfades between tabs with no pop. Position: the icon is
 * slot-wide and translated by (index - dropletPos) * slot, so its
 * centre tracks the tab's centre relative to the droplet frame
 * (the frame itself is centred on dropletPos). The label is
 * re-rendered here too, unscaled — the underlying label is hidden
 * under the glass just like the icon.
 */
function LensTabIcon({
  tab,
  index,
  tabsLength,
  dropletPos,
  barWidth,
  lift,
  holdMagnification,
  iconActive,
  iconInactive,
  isActive,
  labelWrapStyle,
}: {
  tab: LiquidTabItem;
  index: number;
  tabsLength: number;
  dropletPos: SharedValue<number>;
  barWidth: SharedValue<number>;
  lift: SharedValue<number>;
  holdMagnification: number;
  iconActive: string;
  iconInactive: string;
  isActive: boolean;
  labelWrapStyle: AnimatedStyle<ViewStyle>;
}): React.JSX.Element {
  const Icon = tab.icon;
  const lensStyle = useAnimatedStyle(() => {
    const slot = barWidth.value / tabsLength;
    const coverage = interpolate(
      dropletPos.value,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      width: slot,
      opacity: coverage,
      transform: [{ translateX: (index - dropletPos.value) * slot }],
    };
  });
  // The icon inside the lens scales UNIFORMLY with the droplet's
  // hold zoom: one scale factor, same lift value and same factor M
  // as the shader's optical zoom — and the same factor as the
  // underlying icon (MagnifiedTabIcon). The label does not scale.
  const lensIconStyle = useAnimatedStyle(() => {
    const coverage = Math.max(0, 1 - Math.abs(index - dropletPos.value));
    return {
      transform: [{ scale: 1 + (holdMagnification - 1) * lift.value * coverage }],
    };
  });
  return (
    <Animated.View style={[styles.lensTabIcon, lensStyle]} pointerEvents="none">
      <Animated.View style={lensIconStyle}>
        <Icon
          size={ICON_DP}
          color={isActive ? iconActive : iconInactive}
          weight={isActive ? 'fill' : 'regular'}
        />
      </Animated.View>
      <Animated.View style={[styles.labelWrap, labelWrapStyle]}>
        <Text style={[styles.label, { color: isActive ? iconActive : iconInactive }]}>
          {tab.label}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

export function LiquidNavbar({
  tabs,
  selectedIndex,
  onSelect,
  labelFraction,
  blurTarget,
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
  // prop (set via runOnJS from the gesture worklets, next to the
  // lift updates). The native side eases the droplet's
  // magnification 1 -> M over ~200ms itself. BUILD 10: the blur
  // does NOT drop on hold anymore — magnification only.
  const [held, setHeld] = useState(false);

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
  // withTiming + Easing.inOut(Easing.exp), 300ms: the droplet
  // eases out of the old tab, cruises, and eases into the new one,
  // with no overshoot past the target — a spring always overshoots
  // and settles back, which is the jelly feel. Worklet: called
  // worklet-to-worklet from gestures, and from JS only via
  // runOnUI. The selection callback reaches JS only via runOnJS —
  // never a synchronous worklet call from the JS thread.
  const selectTab = useCallback(
    (index: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(tabs.length - 1, Math.round(index)));
      dropletPos.value = withTiming(clamped, {
        duration: 300,
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

  const tap = Gesture.Tap().onEnd((event) => {
    'worklet';
    const slot = barWidth.value / tabs.length;
    selectTab(Math.floor(event.x / slot));
  });

  const longPress = Gesture.LongPress()
    .minDuration(150)
    .maxDistance(12)
    .onStart(() => {
      'worklet';
      lift.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      runOnJS(setHeld)(true);
    })
    .onEnd(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      runOnJS(setHeld)(false);
    })
    .onFinalize(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      runOnJS(setHeld)(false);
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      lift.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      runOnJS(setHeld)(true);
    })
    .onUpdate((event) => {
      'worklet';
      // Follow the finger directly, in tab units, clamped to the tabs.
      // event.x is the finger's position in the bar, so there is no
      // jump when the drag starts.
      const slot = barWidth.value / tabs.length;
      const next = event.x / slot - 0.5;
      dropletPos.value = Math.max(0, Math.min(tabs.length - 1, next));
    })
    .onEnd(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      runOnJS(setHeld)(false);
      selectTab(Math.round(dropletPos.value));
    })
    .onFinalize(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      runOnJS(setHeld)(false);
    });

  // Build 5: hold/drag have priority over tap. Build 4 let tap win
  // outright, so a hold could lose to the tap and the lift never
  // showed; a hold and a drag can be active together (hold for
  // 150ms, then drag, and the droplet stays lifted while it moves).
  const gesture = Gesture.Exclusive(Gesture.Simultaneous(longPress, pan), tap);

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

  // THE DROPLET, BUILD 10 (rebuilt from the build 9 droplet).
  // Anivio's shape, shape only: a capsule spanning ONE TAB SLOT —
  // width = the tab slot width, height = bar height minus 2x4dp
  // inset, corner radius = the BAR's radius minus the inset
  // (barHeight/2 - DROPLET_INSET — the concentric rule, so the
  // droplet reads as the same pill shape as the bar, not a
  // differently-rounded capsule), vertically centred on the BAR
  // (not on the icon). No jelly scaling (pillScaleX/Y = 1 always),
  // no jelly springs, no rubber banding: the frame only translates
  // (tab position). BUILD 10: NO HOLD LIFT (HOLD_LIFT is 0) — on
  // hold the droplet enlarges IN PLACE and does not float up; the
  // hold magnification is optical — the shader's uniform zoom
  // about the droplet centre — never a scale transform on the
  // frame, so there is no HOLD_SWELL either. At rest the droplet
  // is the same glass as the bar (no magnification, same
  // refraction + blur); only on hold does it zoom uniformly, and
  // it KEEPS its blur (driven by the `held` prop into the native
  // view; the native side eases only the magnification now).
  const dropletFrameStyle = useAnimatedStyle(() => {
    const slot = barWidth.value / tabs.length;
    const height = barHeight.value - DROPLET_INSET * 2;
    const centreX = (dropletPos.value + 0.5) * slot;
    return {
      width: slot,
      height,
      // Concentric rounding: the bar's radius (barHeight/2) minus
      // the droplet's inset. Numerically height/2, expressed as
      // the rule so it cannot drift from the bar's rounding.
      borderRadius: barHeight.value / 2 - DROPLET_INSET,
      transform: [
        { translateX: centreX - slot / 2 },
        // BUILD 10: HOLD_LIFT is 0 — the droplet never floats up
        // on hold. It stays exactly where it sits; only the
        // magnification changes.
        { translateY: DROPLET_INSET + HOLD_LIFT * lift.value },
      ],
    };
  });
  // The droplet glass wrapper: droplet frame + 48dp, at -24dp,
  // so the shader's 24dp `outset` region is available and the
  // frame clips it to the capsule — same arrangement as the bar.
  const dropletGlassWrapStyle = useAnimatedStyle(() => {
    const slot = barWidth.value / tabs.length;
    const height = barHeight.value - DROPLET_INSET * 2;
    return {
      width: slot + OUTSET * 2,
      height: height + OUTSET * 2,
    };
  });
  // Labels fade and collapse with the scroll shrink.
  const labelWrapStyle = useAnimatedStyle(() => ({
    height: LABEL_DP * labelFraction.value,
    opacity: labelFraction.value,
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
  // BUILD 9: the droplet's edge light uses the droplet's own rest
  // aspect (slot width over droplet height), so its stroke is a
  // capsule on the droplet's outline too.
  const dropletAspect =
    (screenWidth * settings.barWidthPct) / tabs.length / (settings.barHeight - DROPLET_INSET * 2);

  return (
    <View style={[styles.root, { bottom: insets.bottom + 16 }]}>
      <Animated.View style={[styles.barWrap, barWrapStyle]}>
        <GestureDetector gesture={gesture}>
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
                    blurMethod="dimezisBlurViewSdk31Plus"
                    blurTarget={blurTarget}
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
            {/* THE DROPLET, BUILD 10 (rebuilt from the build 9
                droplet): ABOVE the icon row (zIndex 3 vs the row's
                2) and above the bar glass — over the navbar AND
                over the icons, not below the icons as in builds
                5-8. The frame is a slot-width capsule (Anivio's
                shape, shape only) holding the same glass as the
                bar, and — inside the frame, above the glass and
                the veil but BELOW the edge light — one lens icon +
                label per tab (see LensTabIcon): the droplet glass
                is opaque inside its capsule, so the originals
                underneath it are hidden wherever it covers them,
                and the visible icon inside the droplet is the lens
                icon, which scales uniformly on hold. The edge
                light is the TOPMOST element of the droplet, so it
                crosses over the lens icon and the icon reads as
                under the glass, not pasted on top. Build 9's
                DropletTabDup (above the edge light as well as the
                glass) is removed. On hold the droplet does NOT
                lift (HOLD_LIFT is 0) and does NOT drop its blur:
                the ONLY change on hold is the magnification. It
                never intercepts touches. */}
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
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: veilColor, opacity: settings.legibilityVeil }]}
                />
                {tabs.map((tab, index) => (
                  <LensTabIcon
                    key={tab.key}
                    tab={tab}
                    index={index}
                    tabsLength={tabs.length}
                    dropletPos={dropletPos}
                    barWidth={barWidth}
                    lift={lift}
                    holdMagnification={settings.dropletMagnification}
                    iconActive={iconActive}
                    iconInactive={iconInactive}
                    isActive={index === selectedIndex}
                    labelWrapStyle={labelWrapStyle}
                  />
                ))}
                <EdgeLight intensity={settings.edgeLight} aspect={dropletAspect} />
              </Animated.View>
            </Animated.View>
            <View style={[styles.iconRow, { zIndex: 2 }]}>
              {tabs.map((tab, index) => {
                const active = index === selectedIndex;
                return (
                  <View key={tab.key} style={styles.tabSlot}>
                    {/* BUILD 10: the icon BENEATH the droplet
                        scales uniformly about the droplet centre
                        in sync with the hold magnification (see
                        MagnifiedTabIcon). The label does not
                        scale. */}
                    <MagnifiedTabIcon
                      tab={tab}
                      index={index}
                      dropletPos={dropletPos}
                      lift={lift}
                      holdMagnification={settings.dropletMagnification}
                      color={active ? iconActive : iconInactive}
                      weight={active ? 'fill' : 'regular'}
                    />
                    <Animated.View style={[styles.labelWrap, labelWrapStyle]}>
                      <Text
                        style={[styles.label, { color: active ? iconActive : iconInactive }]}
                      >
                        {tab.label}
                      </Text>
                    </Animated.View>
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
  // BUILD 10: one tab's icon + label, as seen through the
  // droplet lens (see LensTabIcon). Slot-wide, full height,
  // content centred — its translateX/opacity come from the
  // animated lensStyle. It sits ABOVE the glass and veil but
  // BELOW the droplet's edge light, so the rim light crosses over
  // it and it reads as under the glass.
  lensTabIcon: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
