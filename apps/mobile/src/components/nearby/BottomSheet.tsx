import { forwardRef, type ReactNode, useCallback, useImperativeHandle, useRef } from "react";
import { Animated, Dimensions, PanResponder, StyleSheet, View } from "react-native";
import { colors } from "../../theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export interface BottomSheetRef {
  snapTo: (index: number) => void;
}

interface BottomSheetProps {
  snapPoints: number[]; // pixel values from bottom, e.g. [80, SCREEN_HEIGHT*0.5, SCREEN_HEIGHT*0.85]
  initialSnap?: number; // index into snapPoints, default 0
  children: ReactNode;
}

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  ({ snapPoints, initialSnap = 0, children }, ref) => {
    const initialHeight = snapPoints[initialSnap] ?? snapPoints[0];
    // translateY: 0 = fully expanded (top snap), positive = further down
    // We store the sheet height as SCREEN_HEIGHT - translateY
    // So translateY = SCREEN_HEIGHT - sheetHeight
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT - initialHeight)).current;
    const currentSnapIndex = useRef(initialSnap);
    const lastTranslateY = useRef(SCREEN_HEIGHT - initialHeight);

    const snapTo = useCallback(
      (index: number) => {
        const clampedIndex = Math.max(0, Math.min(index, snapPoints.length - 1));
        const targetHeight = snapPoints[clampedIndex];
        const targetY = SCREEN_HEIGHT - targetHeight;

        currentSnapIndex.current = clampedIndex;
        lastTranslateY.current = targetY;

        Animated.spring(translateY, {
          toValue: targetY,
          damping: 20,
          stiffness: 200,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      },
      [snapPoints, translateY],
    );

    useImperativeHandle(ref, () => ({ snapTo }), [snapTo]);

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only capture vertical drags
          return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        },
        onPanResponderGrant: () => {
          // Store current value when drag starts
          translateY.stopAnimation((value) => {
            lastTranslateY.current = value;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const newY = lastTranslateY.current + gestureState.dy;
          // Clamp: don't go above highest snap or below screen
          const maxSnapHeight = snapPoints[snapPoints.length - 1];
          const minY = SCREEN_HEIGHT - maxSnapHeight;
          const maxY = SCREEN_HEIGHT - snapPoints[0];
          const clamped = Math.max(minY, Math.min(maxY, newY));
          translateY.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentY = lastTranslateY.current + gestureState.dy;
          const currentHeight = SCREEN_HEIGHT - currentY;
          const velocity = gestureState.vy;

          // Find closest snap point, biased by velocity
          let targetIndex = 0;
          let minDist = Infinity;

          for (let i = 0; i < snapPoints.length; i++) {
            let dist = Math.abs(currentHeight - snapPoints[i]);
            // Bias toward direction of swipe
            if (velocity < -0.5 && snapPoints[i] > currentHeight) {
              dist *= 0.5; // Favor higher snaps on swipe up
            } else if (velocity > 0.5 && snapPoints[i] < currentHeight) {
              dist *= 0.5; // Favor lower snaps on swipe down
            }
            if (dist < minDist) {
              minDist = dist;
              targetIndex = i;
            }
          }

          const targetHeight = snapPoints[targetIndex];
          const targetY = SCREEN_HEIGHT - targetHeight;

          currentSnapIndex.current = targetIndex;
          lastTranslateY.current = targetY;

          Animated.spring(translateY, {
            toValue: targetY,
            damping: 20,
            stiffness: 200,
            mass: 0.8,
            velocity: gestureState.vy,
            useNativeDriver: true,
          }).start();
        },
      }),
    ).current;

    return (
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>
        <View style={styles.content}>{children}</View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 32,
    height: 3,
    backgroundColor: colors.rule,
    borderRadius: 1.5,
  },
  content: {
    flex: 1,
  },
});
