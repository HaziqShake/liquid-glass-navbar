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
 * the captured backdrop, blurred in the RenderEffect chain, then
 * bent at the rim by the capsule shader (tint fixed at 0.30, the
 * iOS 27 default). No expo-blur in the bar path anymore — the chain
 * does blur + refraction in one GPU pass, not two. Below API 33
 * the bar falls back to a plain expo-blur pill, never a crash.
 *
 * THE DROPLET (Haziq's term): a completely transparent, refractive
 * lens, 48dp, resting INSIDE the bar over the active tab. No fill,
 * no tint, no colour, no blur. A lightweight native shader on the
 * droplet magnifies the icons WITHOUT scaling the icon views — the
 * lens does the magnifying, with displacement zero at the exact
 * centre and growing toward the rim, so the middle icon reads
 * clean. When held, the droplet renders OVER the navbar (an
 * unclipped sibling overlay above the bar silhouette) and swells
 * slightly — the lens grows, the bar and the icons never do.
 *
 * EDGE LIGHT: two overlapping pill-outline rects, each stroked 1px
 * white, each with its own radialGradient centred on ONE bright
 * corner — top-left (cx=0, cy=0) and bottom-right (cx=1, cy=1),
 * r about 0.32, stops 0% alpha 1, 25% alpha 0.5, 100% alpha 0. No
 * halo rect. Brightness is a function of DISTANCE FROM THE CORNER,
 * nothing else: roughly 25-30% of each adjacent edge is lit and
 * the rest is transparent, with the falloff fastest right at the
 * corner. This cannot form a V — a radial gradient's iso-alpha
 * contours are circles centred on the corner, so each bright region
 * is an isolated blob hugging its corner and the middle is dark.
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

import React, { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
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

/** Fixed bar tint mix, the iOS 27 default. Never a user setting. */
const TINT_MIX = 0.3;

/** The native shader samples 24dp beyond the pill on every side. */
const OUTSET = 24;

/** The droplet's resting size: a 48dp lens, fully inside the bar. */
const DROPLET_DP = 48;
/** How far the droplet lifts above the bar while held, in dp. */
const HOLD_LIFT = -10;
/** How much the droplet swells while held (the lens grows, not the bar). */
const HOLD_SWELL = 0.12;

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
  settings: NavbarSettings;
}

/**
 * The edge light.
 *
 * TWO overlapping pill-outline rects, each stroked 1px white, each
 * with its own radialGradient centred on ONE bright corner:
 * top-left (cx=0, cy=0) and bottom-right (cx=1, cy=1),
 * gradientUnits="objectBoundingBox", r=0.32, stops 0% alpha 1, 25%
 * alpha 0.5, 100% alpha 0. No halo rect.
 *
 * THE MATH. Brightness is a function of DISTANCE FROM THE CORNER,
 * nothing else. The gradient is an ellipse in screen space with
 * horizontal radius r * barWidth, so a point on the top edge at
 * bbox-x 0.3 sits at normalised distance d = 0.3 / 0.32 = 0.94 of
 * the way to the gradient edge, and the stops give it alpha
 * 0.5 * (1 - (0.94 - 0.25) / 0.75) = 0.04: effectively dark. At
 * x = 0.16 (d = 0.5) alpha is 0.33, at x = 0.08 (d = 0.25) it is
 * 0.5, at the corner itself it is 1. Roughly 25-30% of each
 * adjacent edge is lit, the rest transparent, falloff fastest right
 * at the corner.
 */
function EdgeLight({ intensity }: { intensity: number }): React.JSX.Element {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <RadialGradient
          id="liquid-edge-tl"
          cx="0"
          cy="0"
          r="0.32"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="25%" stopColor="#FFFFFF" stopOpacity={0.5} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id="liquid-edge-br"
          cx="1"
          cy="1"
          r="0.32"
          gradientUnits="objectBoundingBox"
        >
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="25%" stopColor="#FFFFFF" stopOpacity={0.5} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* One pill outline per bright corner. Each gradient is
          transparent everywhere except near its own corner, so the
          two strokes never add up into a band between them. */}
      <Rect
        x={1}
        y={1}
        width={98}
        height={98}
        rx={49}
        fill="none"
        stroke="url(#liquid-edge-tl)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        opacity={intensity}
      />
      <Rect
        x={1}
        y={1}
        width={98}
        height={98}
        rx={49}
        fill="none"
        stroke="url(#liquid-edge-br)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        opacity={intensity}
      />
    </Svg>
  );
}

export function LiquidNavbar({
  tabs,
  selectedIndex,
  onSelect,
  labelFraction,
  blurTarget,
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
  const lift = useSharedValue(0);

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
    })
    .onEnd(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    })
    .onFinalize(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      lift.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
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
      selectTab(Math.round(dropletPos.value));
    })
    .onFinalize(() => {
      'worklet';
      lift.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    });

  // Tap wins outright; a hold and a drag can be active together (hold
  // for 150ms, then drag, and the droplet stays lifted while it moves).
  const gesture = Gesture.Exclusive(tap, Gesture.Simultaneous(longPress, pan));

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

  // THE DROPLET. A 48dp clear lens, centred on the ACTIVE ICON —
  // not on the whole tab slot, and not as big as the bar. The icon
  // sits in a column with its label: full bar the icon centre is
  // 24dp below the top, shrunk (labels collapsed) it is 25dp, so
  // the lens spans 0-48dp / 1-49dp: fully INSIDE the bar at rest.
  // On hold it lifts above the bar and swells slightly — the lens
  // grows, the bar and the icons never do. No BlurView anywhere
  // near it: the lens is the native GlassView only, which magnifies
  // the icon through its shader (displacement zero at the exact
  // centre, so the middle icon reads clean) without scaling any
  // icon view.
  const dropletFrameStyle = useAnimatedStyle(() => {
    const slot = barWidth.value / tabs.length;
    const centreX = (dropletPos.value + 0.5) * slot;
    const contentH = ICON_DP + LABEL_DP * labelFraction.value;
    const iconCentreY = (barHeight.value - contentH) / 2 + ICON_DP / 2;
    return {
      transform: [
        { translateX: centreX - DROPLET_DP / 2 },
        { translateY: iconCentreY - DROPLET_DP / 2 + HOLD_LIFT * lift.value },
        { scale: 1 + HOLD_SWELL * lift.value },
      ],
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
  // Blur setting (0-100) maps to the chain blur radius: 50 -> 10dp.
  const blurRadiusDp = settings.barBlur * 0.2;

  return (
    <View style={[styles.root, { bottom: insets.bottom + 16 }]}>
      <Animated.View style={[styles.barWrap, barWrapStyle]}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.bar, barStyle]}>
            {HAS_REFRACTION ? (
              <Animated.View style={[styles.glassFill, barGlassWrapStyle]}>
                <GlassView
                  style={StyleSheet.absoluteFill}
                  mode="bar"
                  glowStrength={settings.refractionStrength}
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
            <EdgeLight intensity={settings.edgeLight} />
            <View style={styles.iconRow}>
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
        {/* The droplet lives in an unclipped overlay ABOVE the bar, so
            when held it draws over the navbar silhouette instead of
            being clipped inside it. It never intercepts touches. */}
        <Animated.View style={styles.dropletOverlay} pointerEvents="none">
          <Animated.View style={[styles.dropletFrame, dropletFrameStyle]}>
            {HAS_REFRACTION ? (
              <View style={styles.dropletGlass}>
                <GlassView
                  style={StyleSheet.absoluteFill}
                  mode="droplet"
                  magnification={settings.dropletMagnification}
                />
              </View>
            ) : null}
          </Animated.View>
        </Animated.View>
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
    overflow: 'hidden',
  },
  // Bar glass wrapper sits 24dp beyond the bar frame on every side.
  glassFill: {
    position: 'absolute',
    left: -OUTSET,
    top: -OUTSET,
  },
  // Droplet glass wrapper: droplet frame (48dp) + 48dp, at -24dp.
  dropletGlass: {
    position: 'absolute',
    left: -OUTSET,
    top: -OUTSET,
    width: DROPLET_DP + OUTSET * 2,
    height: DROPLET_DP + OUTSET * 2,
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
  dropletFrame: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DROPLET_DP,
    height: DROPLET_DP,
    borderRadius: DROPLET_DP / 2,
    overflow: 'hidden',
  },
});
