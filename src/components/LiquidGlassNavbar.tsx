import React, { useEffect } from 'react';
import { View, TouchableOpacity, Dimensions, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  interpolateColor,
  Extrapolation,
  SharedValue,
  AnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LiquidGlassView, GlassTier } from 'react-native-liquid-glassmorphism';
import { BlurScrim } from './BlurScrim';
import { House, MagnifyingGlass, Heart, User, CircleNotch } from 'phosphor-react-native';
import { useNavScroll } from '../context/NavScrollContext';

const ICON_MAP: Record<string, any> = {
  House, MagnifyingGlass, Heart, User, CircleNotch,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NAV_WIDTH = SCREEN_WIDTH * 0.9;
const NAV_HEIGHT = 64;
const SHRUNK_HEIGHT = 50;
const NAV_RADIUS = 32;

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
  pillIndex: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
  labelCollapseStyle: AnimatedStyle<ViewStyle>;
  iconScaleStyle: AnimatedStyle<ViewStyle>;
  onPress: (route: string) => void;
}

/**
 * One tab. The active (contrasting) icon is crossfaded in based on how much
 * the sliding droplet overlaps this tab's slot, so the icon only turns bright
 * where the droplet actually is, never before it arrives.
 */
const TabItem: React.FC<TabItemProps> = ({
  item,
  index,
  pillIndex,
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

  return (
    <TouchableOpacity
      style={styles.iconSlot}
      onPress={() => onPress(item.route)}
      activeOpacity={0.7}
    >
      <Animated.View style={[styles.iconWrapper, iconScaleStyle]}>
        <IconComp size={22} color={inactiveColor} weight="regular" />
        <Animated.View style={[StyleSheet.absoluteFill, coverageStyle]}>
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

  const activeIndex = items.findIndex(i => i.route === activeRoute);

  // Transition between tabs (active droplet)
  const pillIndex = useSharedValue(activeIndex >= 0 ? activeIndex : 0);

  useEffect(() => {
    if (activeIndex >= 0) {
      // Ease out animation for smooth transition
      pillIndex.value = withTiming(activeIndex, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [activeIndex]);

  const { translateY, compact, glassPaused, expandNavbar } = useNavScroll();

  const navAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: translateY.value,
        },
      ],
    };
  });

  // Shrink the bar while scrolling down (width + height; droplet follows).
  // The glass is PAUSED during scroll (see glassPaused), so it holds a static
  // frame while resizing, safe, unlike capturing during scroll which crashes.
  const SHRUNK_WIDTH = NAV_WIDTH * 0.7;
  const containerShrinkStyle = useAnimatedStyle(() => ({
    height: interpolate(compact.value, [0, 1], [NAV_HEIGHT, SHRUNK_HEIGHT]),
    width: interpolate(compact.value, [0, 1], [NAV_WIDTH, SHRUNK_WIDTH]),
  }));

  // Hold-to-drag state: the droplet lens grows while dragging
  const dragging = useSharedValue(0);
  const dragStartIndex = useSharedValue(0);

  // The droplet: a clear magnifying lens that slides between tabs.
  // NOT frosted, true liquid glass transmits and bends light.
  const dropletStyle = useAnimatedStyle(() => {
    // Add subtle scale squish during transition for liquid feel
    const scale = interpolate(
      pillIndex.value % 1,
      [0, 0.5, 1],
      [1, 1.05, 1]
    );
    const h = interpolate(compact.value, [0, 1], [NAV_HEIGHT * 0.9, SHRUNK_HEIGHT * 0.9]);
    // Droplet geometry tracks the animated bar width so it stays on its tab
    const w = interpolate(compact.value, [0, 1], [NAV_WIDTH, SHRUNK_WIDTH]);
    const slotW = w / items.length;
    const pillW = slotW * 0.9;
    const pillOff = (slotW - pillW) / 2;
    // The lens detaches and grows while held (reference: drag thumb)
    const ds = interpolate(dragging.value, [0, 1], [1, 1.22]);

    return {
      width: pillW,
      height: h,
      top: interpolate(
        compact.value,
        [0, 1],
        [(NAV_HEIGHT - NAV_HEIGHT * 0.9) / 2, (SHRUNK_HEIGHT - SHRUNK_HEIGHT * 0.9) / 2]
      ),
      transform: [
        { translateX: pillIndex.value * slotW + pillOff },
        { scaleX: scale * ds },
        { scaleY: ds },
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

  const activeColor = '#FFFFFF';
  const inactiveColor = 'rgba(255, 255, 255, 0.65)';

  // Tapping any tab pops a shrunk bar back open, then navigates
  const handlePress = (route: string) => {
    expandNavbar();
    onPress(route);
  };

  // Hold the droplet, then slide it to another tab. The icons crossfade
  // with the droplet automatically since they are driven by pillIndex.
  const pillPan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onBegin(() => {
      'worklet';
      dragStartIndex.value = pillIndex.value;
      dragging.value = withTiming(1, { duration: 180 });
    })
    .onUpdate((e) => {
      'worklet';
      const w = interpolate(compact.value, [0, 1], [NAV_WIDTH, SHRUNK_WIDTH]);
      const slotW = w / items.length;
      const raw = dragStartIndex.value + e.translationX / slotW;
      pillIndex.value = Math.min(Math.max(raw, 0), items.length - 1);
    })
    .onEnd(() => {
      'worklet';
      const snapped = Math.round(pillIndex.value);
      pillIndex.value = withTiming(snapped, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
      runOnJS(handlePress)(items[snapped].route);
    })
    .onFinalize(() => {
      'worklet';
      dragging.value = withTiming(0, { duration: 180 });
    });

  // The invisible drag handle sits above the tabs, so plain taps on the
  // droplet are re-created here (same as tapping the active tab).
  const pillTap = Gesture.Tap().onEnd(() => {
    'worklet';
    runOnJS(handlePress)(activeRoute);
  });

  const pillGesture = Gesture.Exclusive(pillPan, pillTap);

  return (
    <Animated.View
      style={[
        styles.outerWrapper,
        navAnimatedStyle,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
      pointerEvents="box-none"
    >
      {/* The bar itself is the glass, no tint, no glow, no colour. */}
      {/* Blur scrim behind the bar: content dissolves into blur, not a bg-color fade */}
      <BlurScrim edge="bottom" height={170} />
      <AnimatedLiquidGlassView
        variant="clear"
        thickness={0.75}
        blurRadius={6}
        iridescence={0}
        saturation={0.8}
        edgeReflectionStrength={0.35}
        legibilityFloor={0.4}
        interactive
        paused={glassPaused}
        borderRadius={NAV_RADIUS}
        onPipelineReady={(e) => onTier?.(e.nativeEvent.tier)}
        onError={(e) => console.warn('[glass] bar error', e.nativeEvent)}
        style={[
          styles.navContainer,
          containerShrinkStyle,
        ]}>
        {/* Tab Items */}
        <View style={styles.iconRow}>
          {items.map((item, index) => (
            <TabItem
              key={item.route}
              item={item}
              index={index}
              pillIndex={pillIndex}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
              labelCollapseStyle={labelCollapseStyle}
              iconScaleStyle={iconScaleStyle}
              onPress={handlePress}
            />
          ))}
        </View>
      </AnimatedLiquidGlassView>

      {/* The droplet floats OVER the bar (not clipped inside it), when held
          it grows to 1.22x and draws above the navbar silhouette. */}
      {activeIndex >= 0 && (
        <Animated.View
          style={[styles.dropletLayer, containerShrinkStyle, { bottom: Math.max(insets.bottom, 12) }]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={pillGesture}>
            <AnimatedLiquidGlassView
              variant="clear"
              thickness={1.0}
              blurRadius={4}
              iridescence={0}
              saturation={0.8}
              edgeReflectionStrength={0.5}
              paused={glassPaused}
              borderRadius={99}
              onError={(e) => console.warn('[glass] droplet error', e.nativeEvent)}
              style={[styles.droplet, dropletStyle]}
            />
          </GestureDetector>
        </Animated.View>
      )}
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
    width: NAV_WIDTH,
    height: NAV_HEIGHT,
    borderRadius: NAV_RADIUS,
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
