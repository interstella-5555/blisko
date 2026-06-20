import { Image, StyleSheet, Text, View } from "react-native";
import { resolveAvatarUri } from "@/lib/avatar";
import { colors, fonts, ghostBlurRadius } from "../../theme";

interface AvatarProps {
  uri?: string | null;
  name: string | null | undefined;
  size?: number;
  blurred?: boolean;
}

export function Avatar({ uri, name, size = 40, blurred }: AvatarProps) {
  const borderRadius = size / 2;
  const fontSize = size * 0.4;
  // Bulletproof against any `name` (incl. null/undefined/non-string). The prior
  // `name?.trim().charAt(0)` relied on an optional-chaining short-circuit that can
  // be mis-transpiled to `(name?.trim()).charAt(0)`, throwing "charAt of undefined"
  // for a null name (e.g. a fresh user mid-onboarding). See BLI-247.
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const initial = (trimmedName ? trimmedName.charAt(0) : "?").toUpperCase();
  const resolvedUri = resolveAvatarUri(uri, size);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
      ]}
    >
      {resolvedUri ? (
        <>
          <Image
            source={{ uri: resolvedUri }}
            style={[styles.image, { width: size, height: size, borderRadius }]}
            blurRadius={blurred ? ghostBlurRadius : 0}
          />
          <View style={[styles.grayscaleOverlay, { width: size, height: size, borderRadius }]} />
        </>
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius }]}>
          <Text style={[styles.letter, { fontSize, lineHeight: fontSize }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: "hidden",
  },
  image: {
    resizeMode: "cover",
  },
  grayscaleOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: colors.ink,
    opacity: 0.08,
  },
  fallback: {
    backgroundColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  letter: {
    fontFamily: fonts.serif,
    color: colors.bg,
  },
});
