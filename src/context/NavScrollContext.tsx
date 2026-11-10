import React, { createContext, useContext } from 'react';
import {
  useSharedValue,
  useAnimatedScrollHandler,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';

interface NavScrollContextType {
  translateY: SharedValue<number>;
  scrollY: SharedValue<number>;
  compact: SharedValue<number>;
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

  // The navbar stays docked at the bottom at all times. Scrolling does not
  // move the bar away; instead the bar shrinks and its labels fade out while
  // scrolling down. Only the explicit hideNavbar() call fully hides it.
  //
  // There is deliberately NO glass pause here any more. The old code paused
  // the glass capture during every scroll, which froze the bar on a stale
  // frame exactly when the backdrop was moving, and that is why the blur
  // felt like a screenshot. The pause was guarding against a crash from
  // resizing the glass view's layout while it captured, but the bar no
  // longer resizes its layout (the shrink is a transform scale), so there
  // is nothing to guard against. The glass captures live, always.
  const scrollHandler = useAnimatedScrollHandler({
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

  // Pop the bar back open when the user taps a tab while it is shrunk.
  // This only animates `compact`, which drives a transform scale and the
  // label collapse. Neither touches the glass view's layout, so no pause
  // is needed and the glass keeps capturing live through the expand.
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
    <NavScrollContext.Provider value={{ translateY, scrollY, compact, scrollHandler, showNavbar, hideNavbar, expandNavbar }}>
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
