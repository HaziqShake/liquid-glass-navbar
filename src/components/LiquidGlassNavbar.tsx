import React, { useEffect } from 'react';
import { View, TouchableOpacity, Dimensions, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  interpolate,
  interpolateColor,
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
  activeColor: string;
  inactiveColor: string;
  labelCollapseStyle: AnimatedStyle<ViewStyle>;
  iconScaleStyle: AnimatedStyle<ViewStyle>;
  onPress: (route: string) => void;
}

/**
 * One tab. The active (contrasting) icon is crossfaded in based on how much
 * the sliding droplet overlaps this tab's slot, so the icon only turns bright
 * where the droplet actually is, never before it arrives. While the droplet
 * is held, the active icon grows with the press spring (1 + 0.2 * press).
 */
const TabItem: React.FC<TabItemProps> = ({
  item,
  index,
  pillIndex,
  press,
  activeColor,
  inactiveColor,
  labelCollapseStyle,
  iconScaleStyle,
  onPress,
}) => {
  const IconComp = ICON_MAP[item.icon] || CircleNotch;

  // 1 when the droplet is centered on this tab, 0 when a full slot away
  const coverageStyle = useAnimatedStyle(() => {
    const coverage = interpolate(
      pillIndex.value,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP
    );
    return { opacity: coverage };
  });

  const labelColorStyle = useAnimatedStyle(() => {
    const coverage = interpolate(
      pillIndex.value,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP
    );
    return { color: interpolateColor(coverage, [0, 1], [inactiveColor, activeColor]) };
  });

  const contentScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.2 * press.value }],
  }));

  return (
    <TouchableOpacity
      style={styles.iconSlot}
      onPress={() => onPress(item.route)}
      activeOpacity={0.7}
    >
      <Animated.View style={[styles.iconWrapper, iconScaleStyle]}>
        <IconComp size={22} color={inactiveColor} weight="regular" />
        <Animated.View style={[StyleSheet.absoluteFill, coverageStyle, contentScaleStyle]}>
          <IconComp size={22} color={activeColor} weight="fill" />
        </Animated.View>
      </Animated.View>
      <Animated.View style={labelCollapseStyle}>
        <Animated.Text style={[styles.label, labelColorStyle]}>
          {item.label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
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
  // scrolling down (width + height; droplet follows).
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

  // Bar geometry in the current (possibly shrunk) state, for the gesture.
  const geometry = () => {
    'worklet';
    const cfg = settingsShared.value;
    const wFull = SCREEN_WIDTH * cfg.barWidthPct;
    const w = interpolate(compact.value, [0, 1], [wFull, wFull * cfg.shrunkWidthPct]);
    const h = interpolate(compact.value, [0, 1], [cfg.barHeight, cfg.shrunkHeight]);
    const slotW = w / items.length;
    const pillW = slotW * 0.9;
    return { w, h, slotW, pillOff: (slotW - pillW) / 2 };
  };

  // The droplet: a clear magnifying lens that slides between tabs.
  // NOT frosted, true liquid glass transmits and bends light.
  // The jelly squash and stretch (Anivio publish formula): the pill
  // stretches along its direction of travel and squashes vertically,
  // both proportional to speed, X reacting 3x as strongly as Y. The
  // amounts are the settings multipliers on the 0.75 / 0.25 factors.
  const dropletStyle = useAnimatedStyle(() => {
    const cfg = settingsShared.value;
    const speed = jelly.velocity.value / 10;
    const clampSpeed = (v: number) => Math.min(Math.max(v, -0.2), 0.2);
    const sx = cfg.squashEnabled ? cfg.squashX * 0.75 : 0;
    const sy = cfg.squashEnabled ? cfg.squashY * 0.25 : 0;
    const pillScaleX = jelly.scaleX.value / (1 - clampSpeed(speed * sx));
    const pillScaleY = jelly.scaleY.value * (1 - clampSpeed(speed * sy));
    const g = geometry();
    const pillW = g.slotW * 0.9;
    const h = g.h * 0.9;
    return {
      width: pillW,
      height: h,
      top: (g.h - h) / 2,
      transform: [
        { translateX: jelly.position.value * g.slotW + g.pillOff },
        { scaleX: pillScaleX },
        { scaleY: pillScaleY },
      ],
    };
  });

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

  const activeColor = '#FFFFFF';
  const inactiveColor = 'rgba(255, 255, 255, 0.65)';

  // The icon that rides inside the droplet. It has to be a child of the
  // droplet glass view: the shared backdrop capture skips every glass view
  // and its children, so an icon that only lives in the bar is never in the
  // backdrop the droplet samples, and the droplet's own surface paints over
  // it. As a child of the droplet it draws on top of the glass, so it is
  // always visible, and it travels and squashes with the lens.
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

  // Jelly gesture lifecycle (Anivio). No long-press to enter drag mode: the
  // pill follows the finger from touch down, and tap vs drag is decided at
  // release by the 4 dp rule inside jelly.finish.
  const pan = Gesture.Pan()
    .onBegin((e) => {
      'worklet';
      const g = geometry();
      const dropletLeft = jelly.position.value * g.slotW + g.pillOff;
      const dropletTop = (g.h - g.h * 0.9) / 2;
      jelly.begin(
        dropletLeft + e.x,
        dropletTop + e.y,
        g.h,
        g.slotW,
        maxIndex,
        g.w,
      );
    })
    .onUpdate((e) => {
      'worklet';
      const g = geometry();
      jelly.drag(
        e.translationX,
        e.translationY,
        g.slotW,
        maxIndex,
        g.w,
        g.h,
      );
    })
    .onEnd(() => {
      'worklet';
      const g = geometry();
      const index = jelly.finish(g.slotW, maxIndex);
      runOnJS(handlePress)(items[index].route);
    })
    .onFinalize(() => {
      'worklet';
      if (jelly.dragging.value) {
        const g = geometry();
        const index = jelly.finish(g.slotW, maxIndex);
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
      {/* The bar itself is the glass, no tint, no glow, no colour. */}
      {/* Blur scrim behind the bar: content dissolves into blur, not a bg-color fade */}
      <BlurScrim edge="bottom" height={170} />
      <Animated.View style={trackStyle} pointerEvents="box-none">
        <Animated.View style={panelStyle} pointerEvents="box-none">
          <AnimatedLiquidGlassView
            variant="clear"
            thickness={settings.barThickness}
            blurRadius={settings.barBlur}
            iridescence={settings.barIridescence}
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
            {/* Tab Items */}
            <View style={styles.iconRow}>
              {items.map((item, index) => (
                <TabItem
                  key={item.route}
                  item={item}
                  index={index}
                  pillIndex={jelly.position}
                  press={jelly.press}
                  activeColor={activeColor}
                  inactiveColor={inactiveColor}
                  labelCollapseStyle={labelCollapseStyle}
                  iconScaleStyle={iconScaleStyle}
                  onPress={handlePress}
                />
              ))}
            </View>
          </AnimatedLiquidGlassView>

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

          {/* The droplet floats OVER the bar (not clipped inside it), when held
              it grows to the press scale and draws above the navbar silhouette. */}
          {activeIndex >= 0 && (
            <Animated.View
              style={[styles.dropletLayer, containerShrinkStyle, { bottom: 0 }]}
              pointerEvents="box-none"
            >
              <GestureDetector gesture={pan}>
                <AnimatedLiquidGlassView
                  variant="clear"
                  thickness={settings.dropletThickness}
                  blurRadius={settings.dropletBlur}
                  iridescence={settings.dropletIridescence}
                  saturation={settings.saturation}
                  edgeReflectionStrength={settings.dropletEdgeReflection}
                  paused={glassPaused}
                  borderRadius={99}
                  onError={(e) => console.warn('[glass] droplet error', e.nativeEvent)}
                  style={[styles.droplet, dropletStyle]}
                >
                  <View pointerEvents="none" style={styles.dropletIcon}>
                    <ActiveIconComp size={22} color={activeColor} weight="fill" />
                  </View>
                </AnimatedLiquidGlassView>
              </GestureDetector>
            </Animated.View>
          )}
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
  dropletLayer: {
    position: 'absolute',
    alignSelf: 'center',
  },
  droplet: {
    position: 'absolute',
    borderRadius: 99,
  },
  dropletIcon: {
    ...StyleSheet.absoluteFill,
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
