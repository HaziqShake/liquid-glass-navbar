/**
 * Anivio navbar, translated to Expo React Native.
 *
 * Structure (mirrors FloatingNavigationBar.android.kt):
 *   outer bar (the track: fixed 90% width, 64 height, pill radius, shrink
 *   by transform scale only) > inner content wrapper (the jelly track
 *   transforms: panel offset, vertical rubber-band, squash and press grow)
 *   > back to front: real blur, fill, edge highlight, icon row, pill, glow.
 *
 * The blur is REAL on Android: the BlurView uses
 * blurMethod="dimezisBlurViewSdk31Plus" and a blurTarget ref to the
 * BlurTargetView that wraps the DemoScreen content. Without those two,
 * expo-blur on Android renders just a semi-transparent view (its
 * blurMethod defaults to 'none'), which is why the last build had no blur.
 *
 * The pill is a plain translucent View drawn ON TOP of the icons (the
 * user's instruction: "keep it on navbar with droplet on top"). There is
 * no ClipOp.Difference punch-out of the inactive row in this port; the
 * single icon row is drawn under the pill and the pill's 0.15 white fill
 * lets the active icon show through it.
 *
 * The track transforms (panelOffset, trackOffsetY, trackScale,
 * trackScaleX) are applied to the inner wrapper as one transform. Anivio
 * pivots trackScaleX on the touch x (originX); here it is applied around
 * the bar centre instead, a deliberate simplification: the squash is at
 * most 8%, so the visual difference is a few pixels.
 *
 * THREADING (this is what crashed the last build).
 * The crash was Reanimated Worklets: "Tried to synchronously call a
 * Remote Function. Called 'anonymous' on the UI Runtime", from a touch
 * event. A worklet was called synchronously from the JS thread. The
 * rules that prevent it here:
 * - The motion functions are stable worklet references (useCallback in
 *   useJellyMotion). The gesture callbacks and the frame callback are
 *   worklets that call them directly (worklet-to-worklet, same runtime).
 *   They are referenced directly, never through a recreated object.
 * - The only JS call sites are runOnUI(select) and runOnUI(resize),
 *   which schedule the worklet on the UI runtime asynchronously.
 * - runOnJS is used only to notify JS (onSelect); the JS onSelect only
 *   sets React state and never touches a shared value or a worklet.
 * - useAnimatedStyle callbacks only READ shared values.
 * - Shared-value writes from JS (.value = ...) are allowed and are NOT
 *   worklet calls; the only one here mirrors selectedIndex.
 *
 * No software backdrop capture, no liquid-glassmorphism library, no Skia,
 * no snapshot backdrop, no paused state, no tier state.
 */

import React, { useEffect, type RefObject } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import { runOnJS, runOnUI } from 'react-native-reanimated';
import { Defs, LinearGradient, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJellyMotion, type JellyFrame, type SpringScales } from '../jelly/useJellyMotion';
import type { NavbarSettings } from '../settings/settings';

export interface TabItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string; weight: 'fill' | 'regular' }>;
}

const BAR_HEIGHT = 64;
const INSET = 4;
const SHRUNK_WIDTH_PCT = 0.7;
const SHRUNK_HEIGHT = 50;
const GLOW_SIZE = 600;
const GLOW_RADIUS = 300;

const ACTIVE_ICON_COLOR = '#FFFFFF';
const INACTIVE_ICON_COLOR = 'rgba(255,255,255,0.65)';
const PILL_FILL = 'rgba(255,255,255,0.15)';
const BAR_FILL_BASE = '28,28,30';

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
}

function TabSlot({
  index,
  tab,
  isActive,
  frame,
  labelFraction,
  tabCount,
}: {
  index: number;
  tab: TabItem;
  isActive: boolean;
  frame: SharedValue<JellyFrame>;
  labelFraction: SharedValue<number>;
  tabCount: number;
}): React.JSX.Element {
  const Icon = tab.icon;

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
            color={isActive ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR}
            weight={isActive ? 'fill' : 'regular'}
          />
        </Animated.View>
        <Animated.View style={[styles.labelBox, labelStyle]}>
          <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
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
}: AnivioNavbarProps): React.JSX.Element {
  const tabCount = tabs.length;
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  // The bar is 90% of the screen width. The edge stroke is inset by half
  // its width (0.75) so the full 1.5 stroke stays visible.
  const edgeRectWidth = screenWidth * 0.9 - 1.5;
  const edgeRectHeight = settings.barHeight - 1.5;
  const edgeRectRadius = edgeRectHeight / 2;
  // Destructure the stable worklet references once. The gesture callbacks
  // below call these directly (never through a recreated object), so the
  // worklet closure always holds the same function references.
  const { frame, barWidth, select, begin, drag, finish, cancel, resize } = useJellyMotion(
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

  const onBarLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    runOnUI(resize)(width, height, tabCount);
  };

  // Shrink on scroll: the whole bar scales down as the labels collapse.
  // Scale is applied to the outer bar, so it pivots on the bar centre.
  const barShrinkStyle = useAnimatedStyle(() => {
    const f = 1 - labelFraction.value;
    const scaleX = 1 - (1 - SHRUNK_WIDTH_PCT) * f;
    const scaleY = 1 - (1 - SHRUNK_HEIGHT / BAR_HEIGHT) * f;
    return { transform: [{ scaleX }, { scaleY }] };
  });

  // Jelly track transforms on the inner content wrapper (Anivio's L1/L2/L3):
  // horizontal panel shift, vertical rubber-band, squash and press grow.
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
  const pillStyle = useAnimatedStyle(() => {
    const f = frame.value;
    const barW = barWidth.value;
    const barH = BAR_HEIGHT;
    if (barW <= 0) {
      return { left: 0, top: 0, width: 0, height: 0, borderRadius: 0, opacity: 0 };
    }
    const tabW = Math.max((barW - 2 * INSET) / tabCount, 0);
    const itemH = barH - 2 * INSET;
    const centreX = INSET + (f.position + 0.5) * tabW;
    const halfW = (tabW * f.pillScaleX) / 2;
    const halfH = (itemH * f.pillScaleY) / 2;
    return {
      left: centreX - halfW,
      top: barH / 2 - halfH,
      width: halfW * 2,
      height: halfH * 2,
      borderRadius: Math.min(halfW, halfH),
      opacity: 1,
    };
  });

  // Touch glow, ported from drawJellyGlow(): a radial gradient centred on
  // the touch point (originX, glowY), radius 300, peak alpha 0.15.
  // The 600x600 SVG is translated so its centre sits on the touch point.
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

  // Edge highlight. Anivio: vertical white gradient, 0.27 top to 0.02
  // bottom, 0.75dp stroke. The user wants directional light: bright at
  // the top-left, falling to shadow at the bottom-right, so the gradient
  // runs diagonally from the top-left corner to the bottom-right corner.
  const edgeScale = settings.barEdgeReflection / 0.35;
  const edgeTopOpacity = 0.27 * edgeScale;
  const edgeBottomOpacity = 0.02 * edgeScale;

  return (
    <View style={[styles.positioner, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <Animated.View
          onLayout={onBarLayout}
          style={[styles.bar, { height: settings.barHeight, borderRadius: settings.barRadius }, barShrinkStyle]}
        >
          <Animated.View style={[styles.inner, innerStyle]}>
            {/* (a) Real blur. blurMethod + blurTarget are required on
                Android; without them this is just a translucent panel. */}
            <BlurView
              style={StyleSheet.absoluteFill}
              intensity={settings.barBlur}
              tint="dark"
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={blurTarget}
              blurReductionFactor={1}
            />
            {/* (b) Fill. iOS 27 default: moderate body, background clearly visible. */}
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(${BAR_FILL_BASE},${settings.fillOpacity})` }]}
            />
            {/* (c) Edge highlight, diagonal top-left bright to bottom-right shadow. */}
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs>
                <LinearGradient id="barEdge" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={edgeTopOpacity} />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={edgeBottomOpacity} />
                </LinearGradient>
              </Defs>
              <Rect
                x={0.75}
                y={0.75}
                width={edgeRectWidth}
                height={edgeRectHeight}
                rx={edgeRectRadius}
                fill="none"
                stroke="url(#barEdge)"
                strokeWidth={1.5}
              />
            </Svg>
            {/* (d) Icon row. */}
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
                />
              ))}
            </View>
            {/* (e) Pill, on top of the icons. */}
            <Animated.View style={[styles.pill, pillStyle]} pointerEvents="none" />
            {/* (f) Touch glow, on top of everything. */}
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
          </Animated.View>
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
  bar: {
    width: '90%',
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
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
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  labelActive: {
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
  },
  pill: {
    position: 'absolute',
    backgroundColor: PILL_FILL,
  },
  glow: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
});
