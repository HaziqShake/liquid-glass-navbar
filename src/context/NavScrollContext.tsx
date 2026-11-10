import React, { createContext, useContext, useState } from 'react';
import {
  useSharedValue,
  useAnimatedScrollHandler,
  withTiming,
  Easing,
  SharedValue,
  runOnJS,
} from 'react-native-reanimated';

interface NavScrollContextType {
  translateY: SharedValue<number>;
  scrollY: SharedValue<number>;
  compact: SharedValue<number>;
  /** True while the user is actively scrolling, glass views should pause capture to avoid Android crashes */
  glassPaused: boolean;
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  showNavbar: () => void;
  hideNavbar: () => void;
  expandNavbar: () => void;
}

const NavScrollContext = createContext<NavScrollContextType | null>(null);

export const NavScrollProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const translateY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // 0 = navbar expanded, 1 = navbar shrunk (scrolling down)
  const compact = useSharedValue(0);
  const compactTarget = useSharedValue(0);
  // Accumulated scroll in the current direction, for the label fraction
  // (Anivio): the bar only shrinks after 60 px of same-direction scroll.
  const accumulated = useSharedValue(0);
  // Pause liquid-glass capture while scrolling: the Android backdrop-capture
  // pipeline crashes when a visible glass view captures during scroll.
  // The glass holds its last frame while paused and re-captures on resume.
  const [glassPaused, setGlassPaused] = useState(false);

  // The navbar stays docked at the bottom at all times. Scrolling does not
  // move the bar away; instead the bar shrinks and its labels fade out while
  // scrolling down. Only the explicit hideNavbar() call fully hides it.
  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      'worklet';
      runOnJS(setGlassPaused)(true);
    },
    onMomentumBegin: () => {
      'worklet';
      runOnJS(setGlassPaused)(true);
    },
    onEndDrag: () => {
      'worklet';
      // If momentum follows, onMomentumBegin re-pauses immediately,
      // a single resumed frame is harmless (crash needs sustained capture)
      runOnJS(setGlassPaused)(false);
    },
    onMomentumEnd: () => {
      'worklet';
      runOnJS(setGlassPaused)(false);
    },
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      const dy = y - lastScrollY.value;
      lastScrollY.value = y;
      scrollY.value = y;
      if (translateY.value !== 0 && y <= 0) {
        translateY.value = withTiming(0, {
          duration: 250,
          easing: Easing.out(Easing.quad),
        });
      }
      // Label fraction (Anivio): accumulate scroll in the current direction,
      // reset the accumulator on direction change, snap the target at 60 px,
      // then smooth the 0 to 1 transition over 300 ms on the standard curve.
      if ((dy > 0 && accumulated.value < 0) || (dy < 0 && accumulated.value > 0)) {
        accumulated.value = 0;
      }
      accumulated.value += dy;
      let want = compactTarget.value;
      if (accumulated.value > 60) want = 1;
      else if (accumulated.value < -60) want = 0;
      else if (y <= 0) want = 0;
      if (want !== compactTarget.value) {
        compactTarget.value = want;
        compact.value = withTiming(want, {
          duration: 300,
          easing: Easing.bezier(0.2, 0, 0, 1),
        });
      }
    },
  });

  const showNavbar = () => {
    translateY.value = withTiming(0, {
      duration: 250,
      easing: Easing.out(Easing.quad),
    });
  };

  const hideNavbar = () => {
    translateY.value = withTiming(150, {
      duration: 250,
      easing: Easing.in(Easing.quad),
    });
  };

  // Pop the bar back open when the user taps a tab while it is shrunk
  const expandNavbar = () => {
    if (compactTarget.value !== 0) {
      compactTarget.value = 0;
      compact.value = withTiming(0, {
        duration: 250,
        easing: Easing.out(Easing.quad),
      });
    }
  };

  return (
    <NavScrollContext.Provider value={{ translateY, scrollY, compact, glassPaused, scrollHandler, showNavbar, hideNavbar, expandNavbar }}>
      {children}
    </NavScrollContext.Provider>
  );
};

export const useNavScroll = () => {
  const context = useContext(NavScrollContext);
  if (!context) {
    throw new Error('useNavScroll must be used within a NavScrollProvider');
  }
  return context;
};
