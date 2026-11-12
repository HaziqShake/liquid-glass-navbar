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
 * clean. When held, the droplet lifts above the bar silhouette
 * (the bar is overflow visible, so the lift is not clipped) and
 * swells slightly — the lens grows, the bar and the icons never do.
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
 * MOTION: the interactions feel liquid and reactive through one soft
 * spring of my own (a single withSpring on the droplet's tab
 * position) and short timings for the hold lift. No coupled spring
 * engine, no squash and stretch, no rubber banding.
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
  withSpring,
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
 *  Build 8: -20 (was -14). Build 7's device check measured the
 *  mid-hold rise at only ~5dp on the unshrunk bar against -14dp
 *  expected — but the two measurements from that check (rise
 *  ~5dp, swell +26%) are mutually inconsistent with ANY single
 *  lift value (lift ~0.27 predicts +5% swell, lift 1 predicts
 *  +18%), so at least one of them is a rough eyeball of a soft
 *  lens edge, not ground truth, and code review finds no defect
 *  that would cap lift below 1 (pan.onBegin fires on touch down,
 *  longPress.onStart at 150ms, both set lift -> 1 over 180ms;
 *  the transform math gives 18.3dp top rise at lift 1). The lift
 *  value is now printed in the on-screen debug readout (see
 *  DemoScreen), which settles on device whether lift reaches 1.
 *  Meanwhile -20dp makes the lift unmistakable while still
 *  reading as "slightly" — do not balloon the droplet.
 *  BUILD 9: the hold SWELL (a scale transform on the droplet
 *  frame) is DELETED. The hold magnification is optical — the
 *  shader's uniform zoom about the droplet centre — never a view
 *  scale. No jelly scaling (pillScaleX/Y = 1 always). */
const HOLD_LIFT = -20;

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
  /** 0 = droplet resting over the active tab, 1 = held (lifted over
   *  the bar). Owned by the DemoScreen (created there) so its 1s
   *  debug poll can read it — the on-screen readout prints the
   *  lift value as ground truth for the device check (build 8:
   *  the build 7 check measured a ~3x under-delivery, and the
   *  readout settles whether lift actually reaches 1). */
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
 * BUILD 9 — the icon + label of one tab, re-rendered ABOVE the
 * droplet glass inside the droplet frame.
 *
 * WHY A DUPLICATE EXISTS. The droplet overlay sits ABOVE the icon
 * row now (Haziq: the droplet renders over the navbar AND over the
 * icons), and the droplet glass is opaque inside its capsule — so
 * the original icon and label underneath it are hidden wherever
 * the droplet covers them. The visible icon inside the droplet is
 * therefore this duplicate, drawn above the glass. At rest it is
 * pixel-identical to the original it covers (same icon, size,
 * colour and position, scale 1.0), so there is no seam; on hold
 * the icon scales uniformly with the droplet's optical zoom (the
 * same lift value, the same factor M) while the label stays put.
 * Opacity follows the same coverage the icon crossfade uses (1
 * when the droplet is centred on this tab, 0 a full slot away),
 * so a glide crossfades between tabs with no pop — and during a
 * glide the two half-covered tabs each show half an icon, exactly
 * as a sliding lens would.
 * Position: the duplicate is slot-wide and translated by
 * (index - dropletPos) * slot, so its centre tracks the tab's
 * centre relative to the droplet frame (the frame itself is
 * centred on dropletPos).
 */
function DropletTabDup({
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
  const dupStyle = useAnimatedStyle(() => {
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
  // The icon inside the droplet scales UNIFORMLY with the
  // droplet's hold zoom: one scale factor, same lift value and
  // same factor M as the shader's optical zoom. The label does
  // not scale.
  const dupIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (holdMagnification - 1) * lift.value }],
  }));
  return (
    <Animated.View style={[styles.dropletTabDup, dupStyle]} pointerEvents="none">
      <Animated.View style={dupIconStyle}>
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
  // 0 = resting over the active tab, 1 = held (lifted over the bar).
  // Owned by the DemoScreen (a prop), so the debug readout can
  // print the lift value — build 8 ground truth for the hold lift.

  // BUILD 9: the droplet's hold state, as React state. The lift
  // SharedValue drives the droplet's translate/scale on the UI
  // thread; this boolean mirrors it for the droplet GlassView's
  // `held` prop (set via runOnJS from the gesture worklets, next
  // to the lift updates). The native side eases the droplet's
  // magnification 1 -> M and its blur 3dp -> 0 over ~200ms itself.
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

  // Snap the droplet to a tab with one soft spring (a single spring of
  // my own, slight overshoot for the liquid feel) and tell JS which tab
  // was picked. Worklet: called worklet-to-worklet from gestures, and
  // from JS only via runOnUI. The selection callback reaches JS only
  // via runOnJS — never a synchronous worklet call from the JS thread.
  const selectTab = useCallback(
    (index: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(tabs.length - 1, Math.round(index)));
      dropletPos.value = withSpring(clamped, { damping: 15, stiffness: 220, mass: 0.9 });
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

  // THE DROPLET, BUILD 9 (rebuilt from scratch). Anivio's shape,
  // shape only: a capsule spanning ONE TAB SLOT — width = the tab
  // slot width, height = bar height minus 2x4dp inset, corner
  // radius = min(tabWidth, itemHeight)/2 — vertically centred on
  // the BAR (not on the icon). No jelly scaling (pillScaleX/Y = 1
  // always), no jelly springs, no rubber banding: the frame only
  // translates (tab position + hold lift). The hold magnification
  // is optical — the shader's uniform zoom about the droplet
  // centre — never a scale transform on the frame, so the old
  // HOLD_SWELL is gone. At rest the droplet is the same glass as
  // the bar (no magnification, same refraction + blur); only on
  // hold does it zoom uniformly and drop its blur to 0 (driven by
  // the `held` prop into the native view).
  const dropletFrameStyle = useAnimatedStyle(() => {
    const slot = barWidth.value / tabs.length;
    const height = barHeight.value - DROPLET_INSET * 2;
    const centreX = (dropletPos.value + 0.5) * slot;
    return {
      width: slot,
      height,
      borderRadius: height / 2,
      transform: [
        { translateX: centreX - slot / 2 },
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
  // Blur setting (0-100) maps to the chain blur radius: build 7,
  // 50 -> 3dp (was 6dp). The 6dp post-material blur smeared the
  // whole pill milky on device; a lighter blur keeps the
  // background's detail so the rim bend stays visible. The bend
  // (up to 56dp) still dwarfs a 3dp blur. The slider still works.
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
            {/* THE DROPLET, BUILD 9 (rebuilt from scratch): ABOVE
                the icon row (zIndex 3 vs the row's 2) and above the
                bar glass — over the navbar AND over the icons, not
                below the icons as in builds 5-8. The frame is a
                slot-width capsule (Anivio's shape, shape only)
                holding the same glass as the bar, the same edge
                light on its capsule outline, and — above the glass
                — one duplicate icon + label per tab (see
                DropletTabDup): the droplet glass is opaque inside
                its capsule, so the originals underneath it are
                hidden wherever it covers them, and the visible
                icon inside the droplet is the duplicate, which
                scales uniformly on hold. It never intercepts
                touches. On hold it lifts above the bar silhouette:
                the bar is overflow visible, so the lift is not
                clipped. */}
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
                <EdgeLight intensity={settings.edgeLight} aspect={dropletAspect} />
                {tabs.map((tab, index) => (
                  <DropletTabDup
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
              </Animated.View>
            </Animated.View>
            <View style={[styles.iconRow, { zIndex: 2 }]}>
              {tabs.map((tab, index) => {
                const Icon = tab.icon;
                const active = index === selectedIndex;
                return (
                  <View key={tab.key} style={styles.tabSlot}>
                    <Icon
                      size={ICON_DP}
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
  // BUILD 9: one tab's duplicate icon + label, re-rendered above
  // the droplet glass (see DropletTabDup). Slot-wide, full height,
  // content centred — its translateX/opacity come from the
  // animated dupStyle.
  dropletTabDup: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
