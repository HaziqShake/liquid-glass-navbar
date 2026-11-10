/**
 * Anivio navbar, translated to Expo React Native.
 *
 * Structure (mirrors FloatingNavigationBar.android.kt):
 *   positioner (absolute, bottom, centred)
 *     GestureDetector(Exclusive(Pan, Tap))
 *       wrapper (the bar FRAME: animated layout width/height, borderRadius)
 *         bar (absoluteFill, overflow hidden, borderRadius: the glass surface)
 *           BlurView (real blur, static)
 *           RefractionView (native AGSL refraction, static, Android 33+;
 *             replaces the fill; falls back to the fill below API 33 / iOS)
 *           fill (static; only when there is no refraction view)
 *           edge highlight (static, thin, two opposite glowing spots)
 *           touch glow (inside the bar, clipped to the pill shape)
 *           legibility veil (mode-aware, between glass and icons)
 *           inner (jelly track transforms: panelOffset, trackOffsetY,
 *             squash) > icon row
 *         pill overlay (absoluteFill, overflow visible, pointerEvents none:
 *           the droplet sits ON TOP of the bar, unclipped)
 *           blue fill (second icon row in blue, clipped to the pill)
 *           pill (transform-driven: translateX + squash)
 *
 * THE BLUR IS REAL on Android: the BlurView uses
 * blurMethod="dimezisBlurViewSdk31Plus" and a blurTarget ref to the
 * BlurTargetView that wraps the DemoScreen content. Without those two,
 * expo-blur on Android renders just a semi-transparent view (its
 * blurMethod defaults to 'none'), which is why an earlier build had no blur.
 *
 * THE REFRACTION is a native AGSL RuntimeShader (see
 * modules/liquid-glass-refraction), modeled on Anivio's GlassBarShader.kt.
 * It is a hardware RenderEffect over the live backdrop, never a software
 * backdrop capture. It bends the background at the bar's edges (lens
 * effect) with chromatic dispersion. It replaces the fill View (its shader
 * mixes the tint itself via the tintMix uniform); do not stack a fill on
 * top of it or the tint doubles. Below Android API 33 (and on iOS) the
 * refraction view is transparent, so the fill View is rendered instead.
 *
 * SHRINK (the blur-alignment fix). The bar's LAYOUT width/height animate
 * (shrink + press growth), never a scale transform. A scale transform
 * would scale the rendered output but the BlurView would still blur the
 * unscaled layout region, so the blur would be offset (shifted left, with
 * a dark band at the shrunken edge) — exactly the bug in the screenshot.
 * With layout-driven size the BlurView's blur region always matches the
 * bar's displayed bounds. The pill and icons are laid out from the same
 * animated size, so they stay aligned with the shrunken bar.
 *
 * PILL ON TOP. The droplet is a sibling ABOVE the bar (the pill overlay),
 * not a child of the bar's overflow-hidden container, so it is never
 * clipped by the bar. When held it grows and draws over the navbar
 * silhouette. Its position is driven by the jelly shared values and it
 * moves as a whole via transforms (translateX + squash), never via layout
 * props (left/width), so it travels smoothly as a solid droplet instead
 * of sitting like a fixed cookie cutter while its insides move.
 *
 * TAP MOVES THE DROPLET. The Pan gesture alone does not activate for a
 * tap with no movement, so its finish() never runs and a tap did nothing.
 * A Tap gesture (Exclusive with the Pan) calls the motion `tap` worklet,
 * which animates the droplet to the tapped tab. The Tap and the Pan share
 * the same worklet-safe path (worklet-to-worklet, runOnJS only to notify
 * JS). The Pan's onFinalize cancel() is guarded so a tap (< 4dp moved)
 * is never snapped back to the old index.
 *
 * BAR GROWS WHEN HELD, NEVER ON TAP. The bar grows (~6%) only while the
 * droplet is HELD (press sustained > 150ms or a drag). A quick tap never
 * grows the bar: the motion tracks hold time and publishes `holdPress`
 * (1 only on hold), and the bar's pressScale reads holdPress, not press.
 * `press` still drives the icon/pill feedback on tap. Tapping selects the
 * tab and moves the droplet, but does not grow the bar.
 *
 * DROPLET ENLARGEMENT IS SMOOTH. As the droplet approaches a tab it grows
 * gradually, driven by its (spring-smoothed) distance to the nearest tab
 * centre (approachScale in the frame, 1 halfway between tabs, 1.15 on a
 * tab). It never snaps: the scale is a smooth function of position.
 *
 * DROPLET COLOUR FILL (not refraction). When the droplet is over an icon,
 * the part of the icon UNDER the droplet turns blue, and ONLY that part.
 * The droplet itself does not turn blue. Implemented by rendering the
 * icon row a second time in blue, clipped to the droplet's bounds (a
 * container the size of the pill, overflow hidden, tracking the pill's
 * position), so only the overlapping portion shows blue. The droplet
 * stays translucent; it does not become blue.
 *
 * DROPLET REFRACTION (deferred, gated on hold). The droplet has NO
 * refraction yet. When it is added later, it must be active ONLY while
 * the droplet is HELD (isHeld / holdPress > 0), never when idle. The
 * navbar's own refraction stays always-on. The droplet's refraction, when
 * added, must be CLEARER than the navbar's: the navbar is frostier (strong
 * blur + legibility veil), the droplet is completely clear (no blur, no
 * veil, just the translucent fill + colour fill).
 *
 * LEGIBILITY VEIL. An adaptive veil under the icons so they stay readable
 * over clear glass. Dark mode: a dark translucent layer. Light mode: a
 * light translucent layer. Its strength is the legibilityVeil setting. It
 * sits between the glass surface and the icons and never touches the blur
 * or the refraction.
 *
 * DARK / LIGHT MODE. The navbar has a mode setting. Dark: dark fill +
 * white icons. Light: light fill + dark icons. The blur and refraction
 * work the same in both (the refraction shader's tint colour follows the
 * mode via the tintColor uniform). The pill, icons, edge light and veil
 * all adapt to the mode.
 *
 * AMBIENT COLOUR. Liquid glass does not only bend its background colour;
 * it reacts with the colour around it. The edge light is tinted with the
 * background photo's dominant (accent) colour instead of always being
 * white, so the rim picks up the ambient colour of the scene (the green
 * glow in Haziq's screenshot). The refraction itself carries no added
 * colour effects (leave the colours out of the refraction).
 *
 * GLOW INSIDE THE BAR. The touch glow lives INSIDE the bar (the glass
 * bar's overflow-hidden container), clipped to the pill shape. It used to
 * sit in the pill overlay (overflow visible) and leak outside the bar.
 * It is now a child of the bar, so it can never render outside it.
 *
 * EDGE LIGHT. Thin, very thin (1px), glowing ONLY at the top-left and the
 * bottom-right, exactly opposite each other. A diagonal gradient with
 * sharp stops: bright at 0% (top-left) and at 100% (bottom-right),
 * transparent in between, so the light appears as two thin glowing
 * segments at exactly opposite corners and nowhere else. A wider, fainter
 * copy of the same stroke sits underneath as the glow halo. No thick
 * gradient, no full border. The stroke colour is the background accent
 * (ambient colour), not always white.
 *
 * THREADING (this is what crashed an earlier build).
 * The crash was Reanimated Worklets: "Tried to synchronously call a
 * Remote Function. Called 'anonymous' on the UI Runtime", from a touch
 * event. A worklet was called synchronously from the JS thread. The rules
 * that prevent it here:
 * - The motion functions are stable worklet references (useCallback in
 *   useJellyMotion). The gesture callbacks and the frame callback are
 *   worklets that call them directly (worklet-to-worklet, same runtime).
 *   They are referenced directly, never through a recreated object.
 * - The only JS call sites are runOnUI(select) and runOnUI(resize),
 *   which schedule the worklet on the UI runtime asynchronously.
 * - runOnJS is used only to notify JS (onSelect); the JS onSelect only
 *   sets React state and never touches a shared value or a worklet.
 * - useAnimatedStyle / useDerivedValue callbacks only READ shared values.
 * - Shared-value writes from JS (.value = ...) are allowed and are NOT
 *   worklet calls; the only one here mirrors selectedIndex.
 *
 * No software backdrop capture, no liquid-glassmorphism library, no Skia,
 * no snapshot backdrop, no paused state, no tier state.
 */

import React, { useEffect, type RefObject } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import { runOnJS, runOnUI } from 'react-native-reanimated';
import { Defs, LinearGradient, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefractionView } from 'liquid-glass-refraction';
import { useJellyMotion, type JellyFrame, type SpringScales } from '../jelly/useJellyMotion';
import type { NavbarSettings } from '../settings/settings';

export interface TabItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string; weight: 'fill' | 'regular' }>;
}

const INSET = 4;
const GLOW_SIZE = 600;
const GLOW_RADIUS = 300;
/** The bar grows this much (fraction) while the droplet is held. */
const PRESS_GROW = 0.06;
/** Refraction outset, in dp, matching Anivio's 24dp layout outset. */
const REFRACTION_OUTSET = 24;

/** Blue used for the droplet colour fill: the part of an icon under the
 *  droplet turns this blue. The droplet itself does not turn blue. */
const DROPLET_BLUE = '#3B82F6';

/** Mode-aware colours. Dark: dark glass, white icons. Light: light glass,
 *  dark icons. The droplet is completely clear in both (no blur, no veil). */
const DARK = {
  fillBase: '28,28,30',
  activeIcon: '#FFFFFF',
  inactiveIcon: 'rgba(255,255,255,0.65)',
  activeLabel: '#FFFFFF',
  inactiveLabel: 'rgba(255,255,255,0.65)',
  pillFill: 'rgba(255,255,255,0.15)',
  veil: '0,0,0',
  tintColor: [28 / 255, 28 / 255, 30 / 255] as [number, number, number],
};
const LIGHT = {
  fillBase: '255,255,255',
  activeIcon: '#111111',
  inactiveIcon: 'rgba(0,0,0,0.55)',
  activeLabel: '#111111',
  inactiveLabel: 'rgba(0,0,0,0.55)',
  pillFill: 'rgba(0,0,0,0.08)',
  veil: '255,255,255',
  tintColor: [1, 1, 1] as [number, number, number],
};

/** True when the native AGSL refraction view can run (Android API 33+).
 * Re-enabled 10 Nov 2026: the crash was a .gitignore bug, not the module.
 * A bare `android/` rule was ignoring modules/liquid-glass-refraction/android/,
 * so the Kotlin never reached CI and autolinking dropped the module. The
 * .gitignore is now anchored to the repo root (/android/), so the native
 * code is committed and the module links. */
const HAS_REFRACTION =
  Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;

interface AnivioNavbarProps {
  tabs: TabItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** 0..1, animated by the scroll handler. 1 = labels visible, 0 = collapsed. */
  labelFraction: SharedValue<number>;
  /** Ref to the BlurTargetView wrapping the DemoScreen content. */
  blurTarget: RefObject<View | null>;
  settings: NavbarSettings;
  springScales: SharedValue<SpringScales>;
  /** Dominant / accent colour of the current background photo (hex).
   *  The edge light is tinted with it (ambient colour reaction) instead
   *  of always being white. */
  accentColor: string;
}

function TabSlot({
  index,
  tab,
  isActive,
  frame,
  labelFraction,
  tabCount,
  mode,
  blue,
}: {
  index: number;
  tab: TabItem;
  isActive: boolean;
  frame: SharedValue<JellyFrame>;
  labelFraction: SharedValue<number>;
  tabCount: number;
  mode: 'dark' | 'light';
  /** When true, render the icon (and label) in the droplet blue. Used by
   *  the blue fill layer, which is clipped to the droplet's bounds, so
   *  only the part of the icon under the droplet shows blue. */
  blue?: boolean;
}): React.JSX.Element {
  const Icon = tab.icon;
  const palette = mode === 'dark' ? DARK : LIGHT;

  // The tab under the pill grows with the press (contentScale). Anivio
  // applies contentScale to its active row, which is clipped to the pill,
  // so only the pill's content appears to grow. Here the same effect is
  // achieved by scaling the tab nearest the pill's position.
  const scaleStyle = useAnimatedStyle(() => {
    const nearest = Math.min(Math.max(Math.round(frame.value.position), 0), tabCount - 1);
    const scale = index === nearest ? frame.value.contentScale : 1;
    return { transform: [{ scale }] };
  });

  // Anivio shifts the icon down 2dp while the labels are visible.
  const iconStyle = useAnimatedStyle(() => {
    return { transform: [{ translateY: 2 * labelFraction.value }] };
  });

  // Anivio's label box: height 16dp * labelFraction, alpha labelFraction.
  const labelStyle = useAnimatedStyle(() => {
    return {
      height: 16 * labelFraction.value,
      opacity: labelFraction.value,
    };
  });

  return (
    <View style={styles.tabSlot}>
      <Animated.View style={[styles.tabInner, scaleStyle]}>
        <Animated.View style={[styles.iconBox, iconStyle]}>
          <Icon
            size={28}
            color={blue ? DROPLET_BLUE : isActive ? palette.activeIcon : palette.inactiveIcon}
            // The weight matches the normal icon (fill only when active).
            // The blue layer changes ONLY the colour, never the shape, so
            // the clip boundary is a clean colour change, not a shape
            // discontinuity between a filled and an outline glyph.
            weight={isActive ? 'fill' : 'regular'}
          />
        </Animated.View>
        <Animated.View style={[styles.labelBox, labelStyle]}>
          <Text
            style={[
              styles.label,
              { color: blue ? DROPLET_BLUE : isActive ? palette.activeLabel : palette.inactiveLabel },
              isActive && !blue && styles.labelActive,
            ]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function AnivioNavbar({
  tabs,
  selectedIndex,
  onSelect,
  labelFraction,
  blurTarget,
  settings,
  springScales,
  accentColor,
}: AnivioNavbarProps): React.JSX.Element {
  const tabCount = tabs.length;
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const palette = settings.mode === 'dark' ? DARK : LIGHT;
  const isDark = settings.mode === 'dark';
  // Destructure the stable worklet references once. The gesture callbacks
  // below call these directly (never through a recreated object), so the
  // worklet closure always holds the same function references.
  const { frame, select, begin, drag, finish, cancel, resize, tap } = useJellyMotion(
    selectedIndex,
    tabCount,
    springScales,
  );
  const selectedIndexSV = useSharedValue(selectedIndex);

  // Keep the motion's target in step with the selected tab. This runs
  // whenever the parent changes selectedIndex (e.g. after a tap).
  // select is a stable worklet; runOnUI schedules it on the UI runtime.
  // It is never called directly from JS.
  useEffect(() => {
    selectedIndexSV.value = selectedIndex;
    runOnUI(select)(selectedIndex);
  }, [selectedIndex, selectedIndexSV, select]);

  // Animated bar size. Layout-driven (width/height), never a scale
  // transform, so the BlurView's blur region always matches the bar's
  // displayed bounds (see the header note on the shrink fix). The size
  // combines the scroll shrink (labelFraction) and the press growth
  // (frame.holdPress): the bar grows ONLY while the droplet is HELD,
  // never on a quick tap (holdPress stays 0 on tap).
  const fullWidth = screenWidth * 0.9;
  const fullHeight = settings.barHeight;
  const animBarWidth = useDerivedValue(() => {
    const f = 1 - labelFraction.value;
    const shrinkW = 1 - (1 - settings.shrunkWidthPct) * f;
    const pressScale = 1 + PRESS_GROW * frame.value.holdPress;
    return fullWidth * shrinkW * pressScale;
  });
  const animBarHeight = useDerivedValue(() => {
    const f = 1 - labelFraction.value;
    const shrinkH = 1 - (1 - settings.shrunkHeight / fullHeight) * f;
    const pressScale = 1 + PRESS_GROW * frame.value.holdPress;
    return fullHeight * shrinkH * pressScale;
  });

  // Whether the droplet is HELD. The droplet's refraction (when it is
  // added later) must be active ONLY while held. The navbar's own
  // refraction stays always-on. For now this is a recorded requirement:
  // the droplet has no refraction, and this flag gates it when added.
  // isHeld is derived from holdPress (1 only on hold, 0 on tap/idle).
  const isHeld = useDerivedValue(() => frame.value.holdPress > 0.5);
  void isHeld;

  // The bar frame: animated layout size, borderRadius = half the height
  // (a full pill at every size). The frame is the positioning context for
  // both the glass bar and the pill overlay, so they always share a frame.
  const barSizeStyle = useAnimatedStyle(() => ({
    width: animBarWidth.value,
    height: animBarHeight.value,
    borderRadius: animBarHeight.value / 2,
  }));

  // The glass bar's own corner radius (it clips the blur to the pill).
  const barRadiusStyle = useAnimatedStyle(() => ({
    borderRadius: animBarHeight.value / 2,
  }));

  // One Pan gesture on the whole bar, mirroring Anivio's pointerInput:
  // begin on down, drag with the delta from down, finish on release.
  // These callbacks run as worklets on the UI thread, so calling the
  // motion worklets here is worklet-to-worklet on the same runtime.
  // The 4dp tap rule lives in finish().
  const pan = Gesture.Pan()
    .onBegin((event) => {
      'worklet';
      begin(event.x, event.y);
    })
    .onUpdate((event) => {
      'worklet';
      drag(event.translationX, event.translationY);
    })
    .onEnd(() => {
      'worklet';
      const index = finish();
      runOnJS(onSelect)(index);
    })
    .onFinalize((event) => {
      'worklet';
      if (event.state === State.CANCELLED || event.state === State.FAILED) {
        cancel(selectedIndexSV.value);
      }
    });

  // Tap a tab to move the droplet there. The Pan alone does not activate
  // for a tap with no movement, so its finish() never runs and a tap did
  // nothing (swipe only). The Tap gesture runs the motion `tap` worklet
  // (worklet-to-worklet) and notifies JS via runOnJS. It is Exclusive
  // with the Pan: a tap wins when there is no drag, a drag wins when the
  // finger moves, so the two never both select.
  const tapGesture = Gesture.Tap().onEnd((event) => {
    'worklet';
    const index = tap(event.x, event.y);
    runOnJS(onSelect)(index);
  });
  const composedGesture = Gesture.Exclusive(pan, tapGesture);

  const onBarLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    runOnUI(resize)(width, height, tabCount);
  };

  // Jelly track transforms on the icon row only (Anivio's L1/L2/L3):
  // horizontal panel shift, vertical rubber-band, squash and press grow.
  // The blur, fill, refraction and edge are static surface layers and are
  // NOT transformed; moving them with the jelly would misalign the blur.
  const innerStyle = useAnimatedStyle(() => {
    const f = frame.value;
    return {
      transform: [
        { translateX: f.panelOffset },
        { translateY: f.trackOffsetY },
        { scaleX: f.trackScale * f.trackScaleX },
        { scaleY: f.trackScale },
      ],
    };
  });

  // Pill geometry, ported from jellyPillPath() in JellyDrawing.kt:
  // inset 4, tabWidth = (barWidth - 2*inset)/count,
  // itemHeight = barHeight - 2*inset,
  // centreX = inset + (position + 0.5) * tabWidth.
  // The pill moves as a whole via transforms: its layout position is the
  // fixed base (left = inset, top = inset) and translateX carries it to
  // the tab (centreX - tabW/2 - inset = position * tabW). The squash is
  // scaleX/scaleY around the pill's own centre. Nothing here animates a
  // layout prop for movement, so the droplet travels as a solid pill.
  // The width/height are laid out from the same animated bar size as the
  // frame, so the pill stays the right size when the bar shrinks or grows.
  const pillStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const barW = animBarWidth.value;
    const barH = animBarHeight.value;
    if (barW <= 0 || barH <= 0) {
      return {
        width: 0,
        height: 0,
        borderRadius: 0,
        opacity: 0,
        transform: [{ translateX: 0 }, { scaleX: 1 }, { scaleY: 1 }],
      };
    }
    const tabW = Math.max((barW - 2 * INSET) / tabCount, 0);
    const itemH = barH - 2 * INSET;
    return {
      width: tabW,
      height: itemH,
      borderRadius: Math.min(tabW, itemH) / 2,
      opacity: 1,
      transform: [
        { translateX: f.position * tabW },
        { scaleX: f.pillScaleX },
        { scaleY: f.pillScaleY },
      ],
    };
  });

  // DROPLET COLOUR FILL. The blue layer is a second copy of the icon row
  // in droplet blue, clipped to the droplet's bounds, so only the part of
  // an icon UNDER the droplet shows blue. The droplet itself stays
  // translucent; it does not turn blue.
  //
  // Geometry (all in bar-frame coordinates, so the two rows align):
  // - blueClip is a container exactly the size of the pill (tabW x itemH),
  //   at left/top INSET, overflow hidden, tracking the pill's translateX.
  //   It is the clip window: anything outside the pill is cut off.
  // - blueRow inside it is a full bar-width copy of the icon row. It is
  //   positioned at left -INSET and translated by
  //   (panelOffset - position*tabW), which cancels the clip container's
  //   own translateX and leaves it exactly over the normal icon row,
  //   including the same jelly transforms (panelOffset, trackScale).
  //   Its centre matches the normal row's centre, so the squash scales
  //   around the same point.
  // The blue icons are BELOW the pill (the icon is under the glass
  // droplet, which tints it blue) and ABOVE the normal icons.
  const blueClipStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const barW = animBarWidth.value;
    const barH = animBarHeight.value;
    if (barW <= 0 || barH <= 0) {
      return { width: 0, height: 0, borderRadius: 0, opacity: 0, transform: [{ translateX: 0 }] };
    }
    const tabW = Math.max((barW - 2 * INSET) / tabCount, 0);
    const itemH = barH - 2 * INSET;
    return {
      width: tabW,
      height: itemH,
      borderRadius: Math.min(tabW, itemH) / 2,
      opacity: 1,
      transform: [{ translateX: f.position * tabW }],
    };
  });
  const blueRowStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const barW = animBarWidth.value;
    const barH = animBarHeight.value;
    if (barW <= 0 || barH <= 0) {
      return { width: 0, height: 0, transform: [{ translateX: 0 }] };
    }
    const tabW = Math.max((barW - 2 * INSET) / tabCount, 0);
    return {
      width: barW,
      height: barH,
      transform: [
        { translateX: f.panelOffset - f.position * tabW },
        { translateY: f.trackOffsetY },
        { scaleX: f.trackScale * f.trackScaleX },
        { scaleY: f.trackScale },
      ],
    };
  });
  // Touch glow, ported from drawJellyGlow(): a radial gradient centred on
  // the touch point (originX, glowY), radius 300, peak alpha 0.15.
  // The 600x600 SVG is translated so its centre sits on the touch point.
  // The glow lives INSIDE the bar (the bar's overflow-hidden container),
  // so it is clipped to the pill shape and can never render outside it.
  const glowStyle = useAnimatedStyle(() => {
    const f = frame.value;
    return {
      opacity: settings.glowPeak * f.glowOpacity,
      transform: [
        { translateX: f.originX - GLOW_RADIUS },
        { translateY: f.glowY - GLOW_RADIUS },
      ],
    };
  });

  // Edge highlight. Thin, very thin (1px), glowing ONLY at the top-left
  // and the bottom-right, exactly opposite each other. A diagonal gradient
  // with sharp stops: bright at 0% (top-left) and at 100% (bottom-right),
  // transparent in between, so the light appears as two thin glowing
  // segments at exactly opposite corners and nowhere else. The same
  // stroke drawn wider and fainter underneath is the glow halo.
  const edgeScale = settings.barEdgeReflection / 0.35;
  const edgeBright = 0.85 * edgeScale;

  return (
    <View style={[styles.positioner, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <GestureDetector gesture={composedGesture}>
        <Animated.View onLayout={onBarLayout} style={[styles.barFrame, barSizeStyle]}>
          {/* The glass bar. Clipped to the pill shape; holds the static
              surface layers (blur, refraction/fill, edge), the glow, the
              legibility veil and the icons. The touch glow lives INSIDE
              this overflow-hidden container, so it can never render
              outside the bar. */}
          <Animated.View style={[styles.bar, barRadiusStyle]}>
            {/* (a) Real blur. blurMethod + blurTarget are required on
                Android; without them this is just a translucent panel.
                The tint follows the mode (dark/light). This is the
                FROSTIER blur: the navbar is deliberately more frosted
                than the droplet (which is completely clear). */}
            <BlurView
              style={StyleSheet.absoluteFill}
              intensity={settings.barBlur}
              tint={isDark ? 'dark' : 'light'}
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={blurTarget}
              blurReductionFactor={1}
            />
            {/* (b) Refraction + tint (Android 33+). The native AGSL shader
                bends the blurred backdrop at the bar's edges and mixes the
                tint itself (tintMix), so it REPLACES the fill View. It is
                laid out 24dp larger than the bar on every side (Anivio's
                outset) and the bar's clip trims it to the pill shape.
                The tint colour follows the mode (dark #1C1C1E / white).
                No colour effects are added to the refraction itself.
                Below API 33 / on iOS the view is transparent, so the
                fill View is rendered instead. */}
            {HAS_REFRACTION ? (
              <RefractionView
                style={{
                  position: 'absolute',
                  left: -REFRACTION_OUTSET,
                  top: -REFRACTION_OUTSET,
                  right: -REFRACTION_OUTSET,
                  bottom: -REFRACTION_OUTSET,
                }}
                glowStrength={1}
                tintMix={settings.fillOpacity}
                tintColor={palette.tintColor}
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: `rgba(${palette.fillBase},${settings.fillOpacity})` },
                ]}
              />
            )}
            {/* (c) Edge highlight: thin, two opposite glowing spots. The
                SVG is inset 0.5px so the 1px stroke sits exactly on the
                bar's edge. The Rect uses percentages so it tracks the
                bar's animated size. The stroke is tinted with the
                background's accent colour (the glass reacts with the
                ambient colour around it), not always white. */}
            <Svg
              style={styles.edgeSvg}
              width="100%"
              height="100%"
            >
              <Defs>
                <LinearGradient id="barEdge" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor={accentColor} stopOpacity={edgeBright} />
                  <Stop offset="18%" stopColor={accentColor} stopOpacity={0} />
                  <Stop offset="82%" stopColor={accentColor} stopOpacity={0} />
                  <Stop offset="100%" stopColor={accentColor} stopOpacity={edgeBright} />
                </LinearGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width="100%"
                height="100%"
                rx="50%"
                fill="none"
                stroke="url(#barEdge)"
                strokeWidth={3}
                opacity={0.35}
              />
              <Rect
                x={0}
                y={0}
                width="100%"
                height="100%"
                rx="50%"
                fill="none"
                stroke="url(#barEdge)"
                strokeWidth={1}
              />
            </Svg>
            {/* (d) Touch glow. INSIDE the bar (this overflow-hidden
                container), so it is clipped to the pill shape and can
                never render outside the bar. Ported from Anivio's
                drawJellyGlow(): a radial gradient centred on the touch
                point (originX, glowY), radius 300, peak alpha 0.15.
                The 600x600 SVG is translated so its centre sits on the
                touch point. */}
            {settings.glowEnabled ? (
              <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
                <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
                  <Defs>
                    <RadialGradient id="touchGlow" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
                      <Stop offset="45%" stopColor="#FFFFFF" stopOpacity={0.43} />
                      <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect x={0} y={0} width={GLOW_SIZE} height={GLOW_SIZE} fill="url(#touchGlow)" />
                </Svg>
              </Animated.View>
            ) : null}
            {/* (e) Legibility veil. An adaptive veil under the icons so
                they stay readable over clear glass. Dark mode: a dark
                translucent layer. Light mode: a light translucent layer.
                Its strength is the legibilityVeil setting. It sits
                between the glass surface and the icons and never touches
                the blur or the refraction. */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: `rgba(${palette.veil},${settings.legibilityVeil})`,
                },
              ]}
              pointerEvents="none"
            />
            {/* (f) Icon row, with the jelly track transforms. */}
            <Animated.View style={[styles.inner, innerStyle]}>
              <View style={styles.iconRow}>
                {tabs.map((tab, i) => (
                  <TabSlot
                    key={tab.key}
                    index={i}
                    tab={tab}
                    isActive={i === selectedIndex}
                    frame={frame}
                    labelFraction={labelFraction}
                    tabCount={tabCount}
                    mode={settings.mode}
                  />
                ))}
              </View>
            </Animated.View>
          </Animated.View>
          {/* Pill overlay: ON TOP of the bar, unclipped. A sibling of the
              glass bar, sharing the frame, so the droplet is never cut by
              the bar's overflow hidden. When held it grows and draws over
              the navbar silhouette. pointerEvents none so touches reach
              the bar's gesture. */}
          <View style={styles.pillOverlay} pointerEvents="none">
            {/* DROPLET COLOUR FILL. A second copy of the icon row in
                droplet blue, clipped to the droplet's bounds (a container
                exactly the size of the pill, overflow hidden, tracking
                the pill's translateX). Only the part of an icon UNDER the
                droplet shows blue; the rest stays its normal colour. The
                droplet itself does not turn blue. This layer sits BELOW
                the translucent pill (the icon is under the glass) and
                ABOVE the normal icon row. It has no blur and no veil:
                the droplet is completely clear. */}
            <Animated.View style={[styles.blueClip, blueClipStyle]} pointerEvents="none">
              <Animated.View style={[styles.blueRow, blueRowStyle]} pointerEvents="none">
                <View style={styles.iconRow}>
                  {tabs.map((tab, i) => (
                    <TabSlot
                      key={tab.key}
                      index={i}
                      tab={tab}
                      isActive={i === selectedIndex}
                      frame={frame}
                      labelFraction={labelFraction}
                      tabCount={tabCount}
                      mode={settings.mode}
                      blue
                    />
                  ))}
                </View>
              </Animated.View>
            </Animated.View>
            {/* The droplet itself: a translucent pill, completely clear
                (no blur, no veil), just the mode-aware fill. It does NOT
                turn blue; only the icon under it does. No refraction on
                the droplet yet; when added later it must be active ONLY
                while held (see isHeld) and CLEARER than the navbar's. */}
            <Animated.View
              style={[styles.pill, pillStyle, { backgroundColor: palette.pillFill }]}
              pointerEvents="none"
            />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  /** The bar frame. Animated layout size (shrink + press growth). Its
   *  children (glass bar + pill overlay) fill it. Overflow visible so
   *  the droplet can draw over the bar silhouette when it grows. */
  barFrame: {
    overflow: 'visible',
  },
  /** The glass surface. Clips the blur/refraction to the pill shape. */
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
  },
  edgeSvg: {
    position: 'absolute',
    left: 0.5,
    top: 0.5,
    right: 0.5,
    bottom: 0.5,
  },
  iconRow: {
    flex: 1,
    flexDirection: 'row',
    padding: 4,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  labelActive: {
    fontFamily: 'Inter-Medium',
  },
  /** The pill overlay. Fills the bar frame, never clips, never takes
   *  touches. The droplet lives here, above the glass. */
  pillOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'visible',
  },
  /** The droplet. Base position is the fixed inset (left/top); the
   *  animated style carries its size and its translateX/scale movement.
   *  The background colour is mode-aware (palette.pillFill), passed as
   *  an inline style in the JSX. */
  pill: {
    position: 'absolute',
    left: INSET,
    top: INSET,
  },
  /** The blue fill clip window. Exactly the size of the pill, at the same
   *  inset, overflow hidden. The animated style carries its size and its
   *  translateX (it tracks the pill). Anything outside the pill is cut
   *  off, so only the part of an icon under the droplet shows blue. */
  blueClip: {
    position: 'absolute',
    left: INSET,
    top: INSET,
    overflow: 'hidden',
  },
  /** The blue icon row inside the clip window. A full bar-width copy of
   *  the icon row, in droplet blue. Positioned at -INSET so its origin
   *  matches the bar frame's; the animated style carries its size and
   *  the translate that cancels the clip container's movement and aligns
   *  it with the normal icon row. */
  blueRow: {
    position: 'absolute',
    left: -INSET,
    top: -INSET,
  },
  glow: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
});
