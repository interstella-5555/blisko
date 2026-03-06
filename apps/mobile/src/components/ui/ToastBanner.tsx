import { useEffect, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../../theme';
import type { ToastType } from '../../providers/ToastProvider';

interface ToastBannerProps {
  visible: boolean;
  type: ToastType;
  title: string;
  message?: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

const typeColors = {
  error: {
    bg: colors.status.error.bg,
    border: '#D4C4C4',
    bar: colors.status.error.text,
    title: colors.status.error.text,
    message: '#7A4A4A',
  },
  success: {
    bg: colors.status.success.bg,
    border: '#B8C9B9',
    bar: colors.status.success.text,
    title: colors.status.success.text,
    message: '#4A6A4D',
  },
  info: {
    bg: '#EDF1F5',
    border: '#B8C8D8',
    bar: '#4A6B8A',
    title: '#4A6B8A',
    message: '#4A5F73',
  },
};

export function ToastBanner({ visible, type, title, message, onDismiss }: ToastBannerProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-200)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touchActiveRef = useRef(false);
  const c = typeColors[type];

  const startAutoHide = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!touchActiveRef.current) slideOut();
    }, AUTO_DISMISS_MS);
  };

  const slideOut = () => {
    clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -200,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 14,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
      startAutoHide();
    } else {
      slideOut();
    }
    return () => clearTimeout(timerRef.current);
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        touchActiveRef.current = true;
        clearTimeout(timerRef.current);
      },
      onPanResponderMove: (_, gs) => {
        if (gs.dy < 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        touchActiveRef.current = false;
        if (gs.dy < -20) {
          slideOut();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 20,
            stiffness: 300,
            useNativeDriver: true,
          }).start();
          startAutoHide();
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { paddingTop: insets.top + spacing.hairline, transform: [{ translateY }, { scale }] },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable onPress={onDismiss} style={[styles.container, { backgroundColor: c.bg, borderColor: c.border }]}>
        <View style={[styles.bar, { backgroundColor: c.bar }]} />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: c.title }]} numberOfLines={1}>
            {title}
          </Text>
          {message ? (
            <Text style={[styles.message, { color: c.message }]} numberOfLines={2}>
              {message}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    paddingHorizontal: spacing.column,
    paddingBottom: spacing.tight,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.compact,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.column,
    paddingVertical: spacing.gutter,
  },
  bar: {
    width: 2.5,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
});
