import { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { colors, fonts } from "../../theme";

type ButtonVariant = "accent" | "ghost" | "fullWidth" | "wave" | "outline";

interface ButtonProps {
  title?: string;
  variant?: ButtonVariant;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
  testID?: string;
}

export function Button({
  title,
  variant = "accent",
  onPress,
  disabled = false,
  loading = false,
  children,
  testID,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      damping: 20,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 20,
      useNativeDriver: true,
    }).start();
  };

  const containerStyle: ViewStyle[] = [styles.base, variantStyles[variant]];
  if (disabled) containerStyle.push(styles.disabled);

  const textStyle: TextStyle[] = [styles.text, textVariantStyles[variant]];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        testID={testID}
        style={containerStyle}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        {loading && (
          <ActivityIndicator
            size={12}
            color={variant === "ghost" || variant === "outline" ? colors.ink : colors.bg}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={loading ? styles.hidden : undefined}>{children || <Text style={textStyle}>{title}</Text>}</View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  text: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  disabled: {
    opacity: 0.4,
  },
  hidden: {
    opacity: 0,
  },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  accent: {
    backgroundColor: colors.accent,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  fullWidth: {
    backgroundColor: colors.ink,
    width: "100%",
  },
  wave: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.rule,
  },
};

const textVariantStyles: Record<ButtonVariant, TextStyle> = {
  accent: {
    color: "#FFFFFF",
  },
  ghost: {
    color: colors.accent,
  },
  fullWidth: {
    color: colors.bg,
  },
  wave: {
    color: colors.ink,
  },
  outline: {
    color: colors.ink,
  },
};
