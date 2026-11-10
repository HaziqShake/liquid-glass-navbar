import React, { useEffect } from 'react';
import { View, Dimensions, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
  AnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LiquidGlassView, GlassTier } from 'react-native-liquid-glassmorphism';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
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
 * The pill's inset from the bar's edge, in dp. Anivio's jellyPillPath uses
 * a 4dp inset on every side, and the tab row is padded by the same 4dp,
 * so the pill and the icons share one grid.
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
  /** Called once the bar reports which rendering tier the device actually used. */
  onTier?: (tier: GlassTier) => void;
}

// Animated wrapper so the bar can still shrink on scroll
const AnimatedLiquidGlassView = Animated.createAnimatedComponent(LiquidGlassView);

interface TabItemProps {
  item: NavItem;
  index: number;
  /** The jelly position spring (tab-index units, fractional while travelling). */
  pillIndex: SharedValue<number>;
  /** The jelly press spring (0 to 1 while the finger is down). */
  press: SharedValue<number>;
  inactiveColor: string;
  labelCollapseStyle: AnimatedStyle<ViewStyle>;
  iconScaleStyle: AnimatedStyle<ViewStyle>;
}

/**
 * One tab, Anivio's JellyTabRow. The icon and label live in the bar. The
 * icon fades OUT as the pill covers this tab (opacity 1 - coverage),
 * which is Anivio's ClipOp.Difference cut-out: the inactive icon is never
 * drawn under the pill. The bright active icon is not here at all, it is
 * a child of the pill, drawn on top of the pill's fill.
 */
const TabItem: React.FC<TabItemProps> = ({
  item,
  index,
  pillIndex,
  press,
  inactiveColor,
  labelCollapseStyle,
  iconScaleStyle,
}) => {
  const IconComp = ICON_MAP[item.icon] || CircleNotch;

  // 1 when the pill is centered on this tab, 0 when a full slot away
  const fadeStyle = useAnimatedStyle(() => {
    const coverage = interpolate(
      pillIndex.value,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity: 1 - coverage };
  });

  const contentScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.2 * press.value }],
  }));

  return (
    <View style={styles.iconSlot}>
      <Animated.View style={[styles.iconWrapper, iconScaleStyle, fadeStyle]}>
        <IconComp size={22} color={inactiveColor} weight="regular" />
      </Animated.View>
      <Animated.View style={[labelCollapseStyle, fadeStyle]}>
        <Animated.Text style={[styles.label, { color: inactiveColor }]}>
          {item.label}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

export const LiquidGlassNavbar: React.FC<LiquidGlassNavbarProps> = ({
  items,
  activeRoute,
  onPress,
  onTier,
}) => {
  const insets = useSafeAreaInsets();
  const { settings, settingsShared } = useNavbarSettings();

  const activeIndex = items.findIndex(i => i.route === activeRoute);
  const maxIndex = items.length - 1;

  // Jelly motion: eleven coupled springs (Anivio). The position spring is the
  // pill's center in tab-index units; everything else hangs off it. Spring
  // configs come from settings, so they retune live.
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

  const { translateY, compact, glassPaused, expandNavbar } = useNavScroll();

  // Bar geometry, all from settings. Full size first, shrunk size while
  // scrolling down (width + height; pill follows, it is drawn from the
  // bar's size so it cannot drift out of sync).
  const navWidth = SCREEN_WIDTH * settings.barWidthPct;
  const navHeight = settings.barHeight;
  const shrunkWidth = navWidth * settings.shrunkWidthPct;
  const shrunkHeight = settings.shrunkHeight;

  // Shrink the bar while scrolling down. The glass is PAUSED during scroll
  // (see glassPaused), so it holds a static frame while resizing, safe,
  // unlike capturing during scroll which crashes.
  const containerShrinkStyle = useAnimatedStyle(() => ({
    height: interpolate(compact.value, [0, 1], [navHeight, shrunkHeight]),
    width: interpolate(compact.value, [0, 1], [navWidth, shrunkWidth]),
  }));

  // Bar geometry in the current (possibly shrunk) state, for the gesture
  // and the pill. Anivio's tab width: the bar minus the 4dp inset on each
  // side, split evenly. The pill and the gesture share this one tab width,
  // so the finger, the pill and the icons all agree on where a tab is.
  const geometry = () => {
    'worklet';
    const cfg = settingsShared.value;
    const wFull = SCREEN_WIDTH * cfg.barWidthPct;
    const w = interpolate(compact.value, [0, 1], [wFull, wFull * cfg.shrunkWidthPct]);
    const h = interpolate(compact.value, [0, 1], [cfg.barHeight, cfg.shrunkHeight]);
    const tabW = (w - 2 * PILL_INSET) / items.length;
    const itemH = h - 2 * PILL_INSET;
    return { w, h, tabW, itemH };
  };

  // The pill, Anivio's jellyPillPath, drawn as a plain translucent View
  // INSIDE the bar, not a second glass view. That is the whole fix. A plain
  // View has no backdrop capture, so its size can change every frame (squash,
  // stretch, bar shrink) without ever crashing, and because its size is
  // computed from the bar's live size it resizes with the bar by
  // construction, there is no separate layout to keep in sync. It is a
  // solid accent fill at low alpha, exactly like Anivio's selectedSurface,
  // so the icon underneath shows through faintly and the bright active icon
  // (its child) reads on top. The press grow from the jelly springs is the
  // magnification: the pill swells to pressScale while held, 1:1 like Anivio.
  const pillStyle = useAnimatedStyle(() => {
    const cfg = settingsShared.value;
    const speed = jelly.velocity.value / 10;
    const clampSpeed = (v: number) => Math.min(Math.max(v, -0.2), 0.2);
    const sx = cfg.squashEnabled ? cfg.squashX * 0.75 : 0;
    const sy = cfg.squashEnabled ? cfg.squashY * 0.25 : 0;
    const pillScaleX = jelly.scaleX.value / (1 - clampSpeed(speed * sx));
    const pillScaleY = jelly.scaleY.value * (1 - clampSpeed(speed * sy));
    const g = geometry();
    const pillW = g.tabW * pillScaleX;
    const pillH = g.itemH * pillScaleY;
    const centerX = PILL_INSET + (jelly.position.value + 0.5) * g.tabW;
    return {
      width: pillW,
      height: pillH,
      left: centerX - pillW / 2,
      top: (g.h - pillH) / 2,
    };
  });

  // The active icon rides inside the pill, on top of its fill. It grows
  // with the press spring (1 + 0.2 * press), Anivio's contentScale.
  const pillIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.2 * jelly.press.value }],
  }));

  // Labels fade out and collapse while scrolling down
  const labelCollapseStyle = useAnimatedStyle(() => ({
    opacity: 1 - compact.value,
    height: interpolate(compact.value, [0, 1], [14, 0]),
    overflow: 'hidden' as const,
  }));

  const iconScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(compact.value, [0, 1], [1, 0.88]) }],
  }));

  // Whole-bar jelly: the bar scales and pulls around the touch point while
  // dragging (Anivio track springs). The scale pivots on originX via the
  // translate trick, since React Native has no transform origin.
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
    const cfg = settingsShared.value;
    const wFull = SCREEN_WIDTH * cfg.barWidthPct;
    const barW = interpolate(compact.value, [0, 1], [wFull, wFull * cfg.shrunkWidthPct]);
    return {
      transform: [{ translateX: jellyPanelOffset(jelly.panel.value, barW) }],
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

  // The icon that rides inside the pill. It is the selected tab's icon,
  // drawn bright on top of the pill's translucent fill.
  const ActiveIconComp =
    activeIndex >= 0
      ? ICON_MAP[items[activeIndex].icon] || CircleNotch
      : CircleNotch;

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

  // Jelly gesture lifecycle (Anivio). The gesture is on the whole bar, not
  // on the pill: the pill follows the finger from touch down, and tap vs
  // drag is decided at release by the 4dp rule inside jelly.finish. There
  // is no TouchableOpacity on the tabs, the gesture is the only tap path,
  // so a tap can never fire twice.
  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      const g = geometry();
      jelly.begin(e.x, e.y, g.h, g.tabW, maxIndex, g.w);
    })
    .onUpdate((e) => {
      'worklet';
      const g = geometry();
      jelly.drag(
        e.translationX,
        e.translationY,
        g.tabW,
        maxIndex,
        g.w,
        g.h,
      );
    })
    .onEnd(() => {
      'worklet';
      const g = geometry();
      const index = jelly.finish(g.tabW, maxIndex);
      runOnJS(handlePress)(items[index].route);
    })
    .onFinalize(() => {
      'worklet';
      if (jelly.dragging.value) {
        const g = geometry();
        const index = jelly.finish(g.tabW, maxIndex);
        runOnJS(handlePress)(items[index].route);
      }
    });

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
            <AnimatedLiquidGlassView
              variant="clear"
              thickness={settings.barThickness}
              blurRadius={settings.barBlur}
              // No dispersion anywhere: iridescence is the artificial
              // rainbow rim, and it is off.
              iridescence={0}
              saturation={settings.saturation}
              edgeReflectionStrength={settings.barEdgeReflection}
              legibilityFloor={settings.legibilityFloor}
              interactive
              paused={glassPaused}
              borderRadius={settings.barRadius}
              onPipelineReady={(e) => onTier?.(e.nativeEvent.tier)}
              onError={(e) => console.warn('[glass] bar error', e.nativeEvent)}
              style={[
                styles.navContainer,
                containerShrinkStyle,
                { borderRadius: settings.barRadius },
              ]}>
              {/* Tab icons and labels. The pill sits on top of them. */}
              <View style={styles.iconRow}>
                {items.map((item, index) => (
                  <TabItem
                    key={item.route}
                    item={item}
                    index={index}
                    pillIndex={jelly.position}
                    press={jelly.press}
                    inactiveColor={inactiveColor}
                    labelCollapseStyle={labelCollapseStyle}
                    iconScaleStyle={iconScaleStyle}
                  />
                ))}
              </View>

              {/* The pill. A plain translucent View inside the bar, not
                  glass, so it can resize every frame without crashing.
                  It overlays the icons, and its bright active icon rides
                  on top of its fill. */}
              {activeIndex >= 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pill, pillStyle]}
                >
                  <Animated.View style={[styles.pillIcon, pillIconStyle]}>
                    <ActiveIconComp size={22} color="#FFFFFF" weight="fill" />
                  </Animated.View>
                </Animated.View>
              )}

              {/* Touch glow: radial gradient, radius 300, peak alpha from
                  settings, centered on the finger while dragging (Anivio
                  JellyDrawing). */}
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
            </AnimatedLiquidGlassView>
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
  navContainer: {
    flexDirection: 'row',
  },
  pill: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillIcon: {
    justifyContent: 'center',
    alignItems: 'center',
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
