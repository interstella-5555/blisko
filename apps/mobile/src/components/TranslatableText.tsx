// Renders a UGC profile field with a Twitter/X-style translation affordance:
//
//   - viewer in same locale as content → plain text, no affordance
//   - viewer in different locale, cached translation present → translated text
//     + "Pokaż oryginał" tap (toggles back to source)
//   - viewer in different locale, no cached row → original text + "Przetłumacz"
//     tap (fires `profiles.translateContent`, caches into `useTranslationStore`)
//
// BLI-279.

import { Trans, useLingui } from "@lingui/react/macro";
import type { LocaleCode, ViewerTranslatableField } from "@repo/shared";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import { isRateLimitError } from "@/lib/globalErrorHandler";
import { trpc } from "@/lib/trpc";
import { type ProfileTranslationView, pickDisplayText } from "@/lib/ugc-display";
import { useLocaleStore } from "@/stores/localeStore";
import { useTranslationStore } from "@/stores/translationStore";
import { colors, fonts, type as typ } from "@/theme";

interface TranslatableTextProps {
  userId: string;
  field: ViewerTranslatableField;
  original: string | null | undefined;
  sourceLocale: LocaleCode | null | undefined;
  translations: ProfileTranslationView[];
  textStyle?: TextStyle;
}

export function TranslatableText({
  userId,
  field,
  original,
  sourceLocale,
  translations,
  textStyle,
}: TranslatableTextProps) {
  const { t } = useLingui();
  const viewerLocale = useLocaleStore((s) => s.locale);
  const liveTranslation = useTranslationStore((s) => s.translations.get(`${userId}:${field}`));
  const showOriginal = useTranslationStore((s) => s.showOriginal.get(`${userId}:${field}`) ?? false);
  const setTranslation = useTranslationStore((s) => s.setTranslation);
  const toggleShowOriginal = useTranslationStore((s) => s.toggleShowOriginal);

  const translate = trpc.profiles.translateContent.useMutation();

  const display = pickDisplayText({
    field,
    original,
    sourceLocale,
    viewerLocale,
    translations,
    liveTranslation,
    showOriginalOverride: showOriginal,
  });

  const handleTranslate = useCallback(async () => {
    try {
      const res = await translate.mutateAsync({ userId, field });
      if (res.content) {
        setTranslation(userId, field, res.content);
      }
    } catch (err) {
      if (isRateLimitError(err)) return; // global handler shows localized toast
      // Otherwise stay silent — viewer can retry, no destructive failure.
    }
  }, [translate, userId, field, setTranslation]);

  const handleToggleOriginal = useCallback(() => {
    toggleShowOriginal(userId, field);
  }, [toggleShowOriginal, userId, field]);

  if (!display) return null;

  if (display.state === "original") {
    return <Text style={[typ.body, textStyle]}>{display.text}</Text>;
  }

  if (display.state === "translated") {
    return (
      <View>
        <Text style={[typ.body, textStyle]}>{display.text}</Text>
        <Pressable onPress={handleToggleOriginal} hitSlop={8} style={styles.affordance}>
          <Text style={styles.affordanceText}>
            {showOriginal ? <Trans>Przetłumacz</Trans> : <Trans>Pokaż oryginał</Trans>}
          </Text>
        </Pressable>
      </View>
    );
  }

  // needs translation
  return (
    <View>
      <Text style={[typ.body, textStyle]}>{display.text}</Text>
      <Pressable
        onPress={handleTranslate}
        hitSlop={8}
        disabled={translate.isPending}
        style={styles.affordance}
        accessibilityLabel={t`Przetłumacz`}
      >
        {translate.isPending ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Text style={styles.affordanceText}>
            <Trans>Przetłumacz</Trans>
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  affordance: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  affordanceText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.accent,
  },
});
