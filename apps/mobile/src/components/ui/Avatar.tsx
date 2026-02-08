import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const borderRadius = size / 2;
  const fontSize = size * 0.4;

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
      {uri ? (
        <>
          <Image
            source={{ uri }}
            style={[styles.image, { width: size, height: size, borderRadius }]}
          />
          <View
            style={[
              styles.grayscaleOverlay,
              { width: size, height: size, borderRadius },
            ]}
          />
        </>
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius },
          ]}
        >
          <Text style={[styles.letter, { fontSize, lineHeight: fontSize }]}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.rule,
    overflow: 'hidden',
  },
  image: {
    resizeMode: 'cover',
  },
  grayscaleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.ink,
    opacity: 0.08,
  },
  fallback: {
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    fontFamily: fonts.serif,
    color: colors.bg,
  },
});
