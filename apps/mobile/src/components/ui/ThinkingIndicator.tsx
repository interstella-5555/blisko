import { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

const DEFAULT_MESSAGES = [
  'Analizuję Twoje odpowiedzi…',
  'Przygotowuję kolejne pytanie…',
  'Zastanawiam się nad czymś ciekawym…',
  'Jeszcze chwilka…',
  'Szukam najlepszego pytania…',
];

interface ThinkingIndicatorProps {
  messages?: string[];
}

// --- Ink Ripple ---
// Three concentric rings pulse outward from center, staggered

function InkRipple() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createRipple = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(val, {
              toValue: 1,
              duration: 2000,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const a1 = createRipple(ring1, 0);
    const a2 = createRipple(ring2, 600);
    const a3 = createRipple(ring3, 1200);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [ring1, ring2, ring3]);

  const makeRingStyle = (progress: Animated.Value) => ({
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: colors.accent,
    opacity: progress.interpolate({
      inputRange: [0, 0.3, 1],
      outputRange: [0.5, 0.25, 0],
    }),
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.3, 1.8],
        }),
      },
    ],
  });

  return (
    <View style={rippleStyles.container}>
      {/* Center dot — steady pulse */}
      <CenterDot />
      <Animated.View style={makeRingStyle(ring1)} />
      <Animated.View style={makeRingStyle(ring2)} />
      <Animated.View style={makeRingStyle(ring3)} />
    </View>
  );
}

function CenterDot() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);

  return (
    <Animated.View
      style={[
        rippleStyles.centerDot,
        { transform: [{ scale }] },
      ]}
    />
  );
}

const rippleStyles = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});

// --- Typewriter Text ---
// Reveals message character by character, then pauses, then clears and moves to next

function TypewriterText({ messages }: { messages: string[] }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'holding' | 'clearing'>('typing');
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  const currentMessage = messages[msgIndex];
  const displayText = currentMessage.slice(0, charCount);

  // Blinking cursor
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [cursorOpacity]);

  // Typing engine
  useEffect(() => {
    if (phase === 'typing') {
      if (charCount < currentMessage.length) {
        const delay = 30 + Math.random() * 40; // natural variation
        const timer = setTimeout(() => setCharCount((c) => c + 1), delay);
        return () => clearTimeout(timer);
      } else {
        // Done typing — hold for a while
        setPhase('holding');
      }
    }

    if (phase === 'holding') {
      const timer = setTimeout(() => {
        if (messages.length > 1) {
          setPhase('clearing');
        }
      }, 2500);
      return () => clearTimeout(timer);
    }

    if (phase === 'clearing') {
      if (charCount > 0) {
        const timer = setTimeout(() => setCharCount((c) => c - 1), 15);
        return () => clearTimeout(timer);
      } else {
        // Move to next message
        setMsgIndex((i) => (i + 1) % messages.length);
        setPhase('typing');
      }
    }
  }, [phase, charCount, currentMessage, messages]);

  return (
    <View style={typeStyles.container}>
      <Text style={typeStyles.text}>
        {displayText}
        <Animated.Text style={[typeStyles.cursor, { opacity: cursorOpacity }]}>
          |
        </Animated.Text>
      </Text>
    </View>
  );
}

const typeStyles = StyleSheet.create({
  container: {
    minHeight: 22,
    alignItems: 'center',
  },
  text: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    color: colors.muted,
  },
  cursor: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.accent,
    fontWeight: '300',
  },
});

// --- Main Component ---

export function ThinkingIndicator({ messages = DEFAULT_MESSAGES }: ThinkingIndicatorProps) {
  return (
    <View style={styles.container}>
      <InkRipple />
      <View style={{ height: 20 }} />
      <TypewriterText messages={messages} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});
