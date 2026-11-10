import React, { useEffect } from 'react';
import { View, Dimensions, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  interpolate,
  AnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Circle, Rect } from 'react-native-svg';
import { BlurScrim } from './BlurScrim';
import { House, MagnifyingGlass, Heart, User, CircleNotch } from 'phosphor-react-native';
import { useNavScroll } from '../context/NavScrollContext';
import { useJellyMotion } from '../jelly/useJellyMotion';
import { jellyPanelOffset } from '../jelly/JellySpring';
import { useNavbarSettings } from '../settings/SettingsContext';

const ICON_MAP: Record<string, any> = {
  House, MagnifyingGlass, Heart, User, CircleNotch,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Anivio's jellyPillPath inset. The pill sits 4dp inside the bar on every
 * side, and the tab row is padded by the same 4dp, so the pill and the
 * icons share one grid.
 */
const PILL_INSET = 4;

export interface NavItem {
  label: string;
  icon: string;
  route: string;
}

export interface LiquidGlassNavbarProps {
  items: NavItem[];
  activeRoute: string;
  onPress: (route: string) => void;
}

interface TabItemProps {
  item: NavItem;
  /** True for the selected tab: bright icon and label, so it reads through the pill. */
  active: boolean;
  inactiveColor: string;
  labelCollapseStyle: AnimatedStyle<ViewStyle>;
}

/**
 * One tab. The icon and label live in the bar and never move. The active
 * tab is bright (white, fill weight); the inactive tabs are dim (0.65
 * alpha, regular weight). The pill is a translucent overlay drawn ON TOP
 * of this row, so the active icon shows through it. Nothing is drawn on
 * top of the pill, and nothing fades out under it.
 */
const TabItem: React.FC<TabItemProps> = ({
  item,
  active,
  inactiveColor,
  labelCollapseStyle,
}) => {
  const IconComp = ICON_MAP[item.icon] || CircleNotch;
  const color = active ? '#FFFFFF' : inactiveColor;
  const weight = active ? 'fill' : 'regular';

  return (
    <View style={styles.iconSlot}>
      <View style={styles.iconWrapper}>
        <IconComp size={22} color={color} weight={weight} />
      </View>
      <Animated.View style={labelCollapseStyle}>
        <Animated.Text style={[styles.label, { color }]}>
          {item.label}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

/**
 * Tahseen's navbar (Anivio), built in Expo React Native.
 *
 * Anivio's bar is not a software backdrop capture. It is a live GPU blur
 * (Haze, blur radius 24dp, transparent tint) with a dark surface fill
 * (#1C1C1E at 0.55) and a top edge highlight, all drawn by the GPU. That
 * is why it is smooth: there is no capture, no pause, nothing to freeze
 * or crash. This port uses the same approach: expo-blur's BlurView is
 * the Haze equivalent (a live GPU blur of whatever is behind the bar),
 * with the same dark fill and edge highlight layered on top. The pill,
 * the jelly springs and the whole-bar gesture are Anivio's, ported 1:1.
 */
export const LiquidGlassNavbar: React.FC<LiquidGlassNavbarProps> = ({
  items,
  activeRoute,
  onPress,
}) => {
  const insets = useSafeAreaInsets();
  const { settings, settingsShared } = useNavbarSettings();

  const activeIndex = items.findIndex(i => i.route === activeRoute);
  const maxIndex = items.length - 1;

  // Jelly motion: eleven coupled springs (Anivio). The position spring is
  // the pill's centre in tab-index units; everything else hangs off it.
  const jelly = useJellyMotion(
    activeIndex >= 0 ? activeIndex : 0,
    items.length,
    settingsShared,
  );

  // If the active route ever changes from outside, drive the pill there.
  useEffect(() => {
    if (
      activeIndex >= 0 &&
      Math.round(jelly.positionTarget.value) !== activeIndex
    ) {
      jelly.select(activeIndex);
    }
  }, [activeIndex]);

  const { translateY, compact, expandNavbar } = useNavScroll();

  // ------------------------------------------------------------------
  // Bar geometry. FIXED. The bar's layout size never changes: width is
  // 90% of the screen and height is 64, always. The shrink is a
  // transform scale (below), which only changes how the bar is drawn,
  // never its layout.
  // ------------------------------------------------------------------
  const navWidth = SCREEN_WIDTH * settings.barWidthPct;
  const navHeight = settings.barHeight;
  // Anivio's tab width: the bar minus the 4dp inset on each side, split
  // evenly. The pill and the gesture share this one tab width, so the
  // finger, the pill and the icons all agree on where a tab is.
  const tabW = (navWidth - 2 * PILL_INSET) / items.length;
  const itemH = navHeight - 2 * PILL_INSET;

  // ------------------------------------------------------------------
  // Shrink. A transform scale driven by `compact`, 1 at rest and the
  // shrunk size while scrolling down. It is applied to the bar itself,
  // which has explicit width and height, so the pivot is definitely
  // the bar's centre: translate to the centre, scale, translate back.
  // The bar stays centred while it shrinks. This is a pure transform:
  // the bar's layout size never changes. The pill is a child of the
  // bar, so it is scaled by the same transform and resizes with the
  // bar by construction. The ratios come from settings: width to
  // shrunkWidthPct, height to shrunkHeight / barHeight.
  // ------------------------------------------------------------------
  const barShrinkStyle = useAnimatedStyle(() => {
    const cfg = settingsShared.value;
    const sx = interpolate(compact.value, [0, 1], [1, cfg.shrunkWidthPct]);
    const sy = interpolate(compact.value, [0, 1], [1, cfg.shrunkHeight / cfg.barHeight]);
    const cx = navWidth / 2;
    const cy = navHeight / 2;
    return {
      transform: [
        { translateX: cx },
        { translateY: cy },
        { scaleX: sx },
        { scaleY: sy },
        { translateX: -cx },
        { translateY: -cy },
      ],
    };
  });

  // ------------------------------------------------------------------
  // The pill, Anivio's jellyPillPath, as a plain translucent View
  // INSIDE the bar. It is not glass. A plain View has no backdrop
  // capture, so its size can change every frame (squash, stretch) and
  // it can be transform-scaled with the bar without ever crashing.
  // Geometry is Anivio's, from the FIXED bar size: 4dp inset, tab width
  // = (bar width - 8) / count, item height = bar height - 8, centre =
  // inset + (position + 0.5) * tab width. The squash and stretch come
  // from the jelly springs, the same publish formula Anivio uses.
  // ------------------------------------------------------------------
  const pillStyle = useAnimatedStyle(() => {
    const cfg = settingsShared.value;
    const speed = jelly.velocity.value / 10;
    const clampSpeed = (v: number) => Math.min(Math.max(v, -0.2), 0.2);
    const sx = cfg.squashEnabled ? cfg.squashX * 0.75 : 0;
    const sy = cfg.squashEnabled ? cfg.squashY * 0.25 : 0;
    const pillScaleX = jelly.scaleX.value / (1 - clampSpeed(speed * sx));
    const pillScaleY = jelly.scaleY.value * (1 - clampSpeed(speed * sy));
    const pillW = tabW * pillScaleX;
    const pillH = itemH * pillScaleY;
    const centerX = PILL_INSET + (jelly.position.value + 0.5) * tabW;
    return {
      width: pillW,
      height: pillH,
      left: centerX - pillW / 2,
      top: (itemH - pillH) / 2 + PILL_INSET,
    };
  });

  // Labels fade out and collapse while scrolling down. Labels are plain
  // Views, not glass, so collapsing them is safe.
  const labelCollapseStyle = useAnimatedStyle(() => ({
    opacity: 1 - compact.value,
    height: interpolate(compact.value, [0, 1], [14, 0]),
    overflow: 'hidden' as const,
  }));

  // Whole-bar jelly: the bar scales and pulls around the touch point
  // while dragging (Anivio track springs). The scale pivots on originX
  // via the translate trick, since React Native has no transform origin.
  const trackStyle = useAnimatedStyle(() => {
    const ox = jelly.originX.value;
    return {
      transform: [
        { translateX: ox },
        { scaleX: jelly.trackX.value },
        { scale: jelly.trackPress.value },
        { translateX: -ox },
        { translateY: translateY.value + jelly.trackY.value },
      ],
    };
  });

  // The bar content lags a few dp behind the finger (Anivio panel offset).
  const panelStyle = useAnimatedStyle(() => {
    if (!settingsShared.value.panelLagEnabled) {
      return { transform: [{ translateX: 0 }] };
    }
    return {
      transform: [{ translateX: jellyPanelOffset(jelly.panel.value, navWidth) }],
    };
  });

  // Touch glow: radial gradient centered on the finger while dragging.
  const glowStyle = useAnimatedStyle(() => {
    const opacity = Math.min(Math.max(jelly.glow.value, 0), 1);
    return {
      opacity,
      transform: [
        { translateX: jelly.originX.value - 150 },
        { translateY: jelly.glowY.value - 150 },
      ],
    };
  });

  const inactiveColor = 'rgba(255, 255, 255, 0.65)';

  // Tapping any tab pops a shrunk bar back open, then navigates. The pill
  // springs there with a press pulse (jelly select).
  const handlePress = (route: string) => {
    expandNavbar();
    const index = items.findIndex(i => i.route === route);
    if (index >= 0) {
      jelly.select(index);
    }
    onPress(route);
  };

  // Jelly gesture lifecycle (Anivio). The gesture is on the whole bar,
  // not on the pill: the pill follows the finger from touch down, and
  // tap vs drag is decided at release by the 4dp rule inside
  // jelly.finish. There is no TouchableOpacity on the tabs, the gesture
  // is the only tap path, so a tap can never fire twice. Geometry is
  // fixed (tabW, navWidth, navHeight), so the finger and the pill agree
  // even while the bar is shrunk: the gesture reports layout
  // coordinates, and the pill is laid out in layout coordinates.
  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      jelly.begin(e.x, e.y, navHeight, tabW, maxIndex, navWidth);
    })
    .onUpdate((e) => {
      'worklet';
      jelly.drag(
        e.translationX,
        e.translationY,
        tabW,
        maxIndex,
        navWidth,
        navHeight,
      );
    })
    .onEnd(() => {
      'worklet';
      const index = jelly.finish(tabW, maxIndex);
      runOnJS(handlePress)(items[index].route);
    })
    .onFinalize(() => {
      'worklet';
      if (jelly.dragging.value) {
        const index = jelly.finish(tabW, maxIndex);
        runOnJS(handlePress)(items[index].route);
      }
    });

  // Anivio's edge highlight: a vertical white gradient, strong at the
  // top (0.27) fading to almost nothing at the bottom (0.02), drawn as
  // a thin stroke around the bar. The strength follows the edge
  // reflection setting.
  const edgeTop = 0.27 * settings.barEdgeReflection / 0.35;
  const edgeBottom = 0.02 * settings.barEdgeReflection / 0.35;

  return (
    <Animated.View
      style={[
        styles.outerWrapper,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
      pointerEvents="box-none"
    >
      {/* Blur scrim behind the bar: content dissolves into blur, not a bg-color fade */}
      <BlurScrim edge="bottom" height={170} />
      <Animated.View style={trackStyle} pointerEvents="box-none">
        <Animated.View style={panelStyle} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.bar,
                { width: navWidth, height: navHeight, borderRadius: settings.barRadius },
                barShrinkStyle,
              ]}>
              {/* The bar background, Anivio's GlassBarSurface. A live GPU
                  blur (expo-blur, the Haze equivalent) of whatever is
                  behind the bar, with Anivio's dark surface fill
                  (#1C1C1E at 0.55) on top. No software capture, no
                  pause, no freeze, no crash: the blur is live because
                  the GPU does it every frame. */}
              <BlurView
                intensity={settings.barBlur}
                tint="dark"
                style={[styles.barBackground, { borderRadius: settings.barRadius }]}
              />
              <View
                pointerEvents="none"
                style={[styles.barFill, { borderRadius: settings.barRadius }]}
              />
              {/* Edge highlight: Anivio's vertical white gradient stroke,
                  strong at the top, fading to nothing at the bottom. */}
              <Svg
                pointerEvents="none"
                style={[styles.barEdge, { borderRadius: settings.barRadius }]}
                width={navWidth}
                height={navHeight}>
                <Defs>
                  <LinearGradient id="barEdge" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={edgeTop} />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity={edgeBottom} />
                  </LinearGradient>
                </Defs>
                <Rect
                  x={0.75}
                  y={0.75}
                  width={navWidth - 1.5}
                  height={navHeight - 1.5}
                  rx={settings.barRadius - 0.75}
                  fill="none"
                  stroke="url(#barEdge)"
                  strokeWidth={1.5}
                />
              </Svg>

              {/* Tab icons and labels. They live in the bar. The pill
                  is drawn on top of them, below. */}
              <View style={styles.iconRow}>
                {items.map((item, index) => (
                  <TabItem
                    key={item.route}
                    item={item}
                    active={index === activeIndex}
                    inactiveColor={inactiveColor}
                    labelCollapseStyle={labelCollapseStyle}
                  />
                ))}
              </View>

              {/* The pill. A plain translucent View inside the bar,
                  not glass, drawn ON TOP of the icons. The active icon
                  underneath shows through its 0.15 alpha fill. It is
                  a child of the bar, so the shrink transform scales
                  it in lockstep with the bar, and its geometry comes
                  from the bar's fixed size, so it can never drift. */}
              {activeIndex >= 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pill, pillStyle]}
                />
              )}

              {/* Touch glow: radial gradient, radius 300, peak alpha
                  from settings, centered on the finger while dragging
                  (Anivio JellyDrawing). */}
              {settings.glowEnabled && (
                <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
                  <Svg width={300} height={300}>
                    <Defs>
                      <RadialGradient
                        id="touchGlow"
                        cx="150"
                        cy="150"
                        r="150"
                        gradientUnits="userSpaceOnUse"
                      >
                        <Stop offset="0" stopColor="#FFFFFF" stopOpacity={settings.glowPeak} />
                        <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={settings.glowPeak * 0.43} />
                        <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Circle cx="150" cy="150" r="150" fill="url(#touchGlow)" />
                  </Svg>
                </Animated.View>
              )}
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  bar: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  barBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(28, 28, 30, 0.55)',
  },
  barEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  pill: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  glow: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 300,
    height: 300,
  },
  iconRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_INSET,
  },
  iconSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapper: {
    position: 'relative',
    marginBottom: 2,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    marginTop: -2,
    fontWeight: '500',
  },
});
