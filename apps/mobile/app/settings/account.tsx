import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";
import { authClient } from "@/lib/auth";
import { showToast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/stores/authStore";
import { colors, fonts, spacing, type as typ } from "@/theme";
import { signOutAndReset } from "../_layout";

function FacebookIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z"
        stroke={colors.ink}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LinkedInIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z"
        stroke={colors.ink}
        strokeWidth={1.8}
      />
      <Path d="M2 9h4v12H2z" stroke={colors.ink} strokeWidth={1.8} />
      <Path d="M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke={colors.ink} strokeWidth={1.8} />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.913 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
        fill={colors.ink}
      />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colors.status.success.text}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

const providerConfig = {
  google: { label: "Google", Icon: GoogleIcon },
  apple: { label: "Apple", Icon: AppleIcon },
  facebook: { label: "Facebook", Icon: FacebookIcon },
  linkedin: { label: "LinkedIn", Icon: LinkedInIcon },
} as const;

type Provider = keyof typeof providerConfig;

function ConnectedAccountRow({
  provider,
  connected,
  username,
  onConnect,
  onDisconnect,
  disconnecting,
}: {
  provider: Provider;
  connected: boolean;
  username: string | null | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { label, Icon } = providerConfig[provider];
  const hasUsername = provider === "facebook" || provider === "linkedin";

  return (
    <View style={styles.providerRow}>
      <View style={styles.providerIcon}>
        <Icon />
      </View>
      <View style={styles.providerInfo}>
        <Text style={styles.providerName}>{label}</Text>
        {connected ? (
          <View style={styles.connectedBadge}>
            <CheckIcon />
            <Text style={styles.connectedText}>{hasUsername && username ? `@${username}` : "Połączono"}</Text>
          </View>
        ) : (
          <Text style={styles.providerStatus}>Nie połączono</Text>
        )}
      </View>
      {connected ? (
        <Pressable onPress={onDisconnect} disabled={disconnecting} hitSlop={8}>
          <Text style={styles.disconnectText}>ODŁĄCZ</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.connectButton} onPress={onConnect}>
          <Text style={styles.connectText}>POŁĄCZ</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function AccountScreen() {
  const user = useAuthStore((state) => state.user);

  const [isDeleting, setIsDeleting] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const connectedAccounts = trpc.accounts.listConnected.useQuery();
  const disconnectAccount = trpc.accounts.disconnect.useMutation({
    onSuccess: () => {
      connectedAccounts.refetch();
    },
  });
  const requestDeletion = trpc.accounts.requestDeletion.useMutation();

  const requestExport = trpc.accounts.requestDataExport.useMutation({
    onSuccess: () => {
      showToast("success", "Eksport danych", "Eksport został zlecony. Sprawdź swój e-mail.");
    },
    onError: () => {
      showToast("error", "Błąd", "Nie udało się zlecić eksportu. Spróbuj ponownie.");
    },
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      "Usuń konto",
      "Czy na pewno chcesz usunąć swoje konto? Twoje dane zostaną trwale usunięte w ciągu 14 dni.",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Kontynuuj",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await authClient.emailOtp.sendVerificationOtp({
                email: user!.email,
                type: "sign-in",
              });
              setOtpStep(true);
            } catch {
              Alert.alert("Błąd", "Nie udało się wysłać kodu weryfikacyjnego.");
            }
            setIsDeleting(false);
          },
        },
      ],
    );
  };

  const handleConfirmDeletion = async () => {
    if (otp.length !== 6) return;
    setOtpLoading(true);
    try {
      await requestDeletion.mutateAsync({ otp });
      await signOutAndReset();
    } catch {
      Alert.alert("Błąd", "Nieprawidłowy kod. Spróbuj ponownie.");
    }
    setOtpLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>EMAIL</Text>
      <View style={styles.emailRow}>
        <Text style={styles.emailText}>{user?.email}</Text>
        <Pressable onPress={() => router.push("/settings/change-email" as never)} hitSlop={8}>
          <Text style={styles.changeEmailText}>ZMIEŃ</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>POŁĄCZONE KONTA</Text>

      {connectedAccounts.isLoading ? (
        <ActivityIndicator color={colors.muted} style={{ marginVertical: spacing.gutter }} />
      ) : (
        <>
          {Platform.OS === "ios" && (
            <ConnectedAccountRow
              provider="apple"
              connected={!!connectedAccounts.data?.find((a) => a.providerId === "apple")}
              username={connectedAccounts.data?.find((a) => a.providerId === "apple")?.username}
              onConnect={() => authClient.signIn.social({ provider: "apple", callbackURL: "/settings/account" })}
              onDisconnect={() => disconnectAccount.mutate({ providerId: "apple" })}
              disconnecting={disconnectAccount.isPending}
            />
          )}
          <ConnectedAccountRow
            provider="google"
            connected={!!connectedAccounts.data?.find((a) => a.providerId === "google")}
            username={connectedAccounts.data?.find((a) => a.providerId === "google")?.username}
            onConnect={() => authClient.signIn.social({ provider: "google", callbackURL: "/settings/account" })}
            onDisconnect={() => disconnectAccount.mutate({ providerId: "google" })}
            disconnecting={disconnectAccount.isPending}
          />
          <ConnectedAccountRow
            provider="facebook"
            connected={!!connectedAccounts.data?.find((a) => a.providerId === "facebook")}
            username={connectedAccounts.data?.find((a) => a.providerId === "facebook")?.username}
            onConnect={() => authClient.signIn.social({ provider: "facebook", callbackURL: "/settings/account" })}
            onDisconnect={() => disconnectAccount.mutate({ providerId: "facebook" })}
            disconnecting={disconnectAccount.isPending}
          />
          <ConnectedAccountRow
            provider="linkedin"
            connected={!!connectedAccounts.data?.find((a) => a.providerId === "linkedin")}
            username={connectedAccounts.data?.find((a) => a.providerId === "linkedin")?.username}
            onConnect={() => authClient.signIn.social({ provider: "linkedin", callbackURL: "/settings/account" })}
            onDisconnect={() => disconnectAccount.mutate({ providerId: "linkedin" })}
            disconnecting={disconnectAccount.isPending}
          />
        </>
      )}

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>EKSPORT DANYCH</Text>
      <Text style={styles.exportDescription}>
        Pobierz kopię wszystkich swoich danych w formacie JSON. Link do pobrania zostanie wysłany na Twój adres e-mail.
      </Text>
      <Pressable style={styles.exportButton} onPress={() => requestExport.mutate()} disabled={requestExport.isPending}>
        {requestExport.isPending ? (
          <ActivityIndicator color={colors.ink} size="small" />
        ) : (
          <Text style={styles.exportButtonText}>POBIERZ MOJE DANE</Text>
        )}
      </Pressable>

      {otpStep ? (
        <View style={styles.deleteSection}>
          <Text style={styles.deleteText}>Wpisz kod weryfikacyjny</Text>
          <Text style={styles.deleteDescription}>Wysłaliśmy 6-cyfrowy kod na {user?.email}</Text>
          <TextInput
            style={styles.otpInput}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            autoFocus
          />
          <Pressable
            style={[styles.confirmDeleteButton, otp.length !== 6 && { opacity: 0.5 }]}
            onPress={handleConfirmDeletion}
            disabled={otp.length !== 6 || otpLoading}
          >
            {otpLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.confirmDeleteText}>Usuń konto</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.deleteSection} onPress={handleDeleteAccount} disabled={isDeleting}>
          {isDeleting ? (
            <ActivityIndicator color={colors.muted} size="small" />
          ) : (
            <>
              <Text style={styles.deleteText}>Usuń konto</Text>
              <Text style={styles.deleteDescription}>
                Trwale usuwa Twoje konto, profil i wszystkie dane. Proces trwa do 14 dni.
              </Text>
            </>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.section,
    paddingTop: spacing.column,
    paddingBottom: spacing.block,
  },
  sectionLabel: {
    ...typ.label,
    marginBottom: spacing.gutter,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emailText: {
    ...typ.body,
  },
  changeEmailText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: colors.rule,
    marginVertical: spacing.section,
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.column,
    paddingVertical: spacing.gutter,
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.mapBg,
    justifyContent: "center",
    alignItems: "center",
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.ink,
  },
  providerStatus: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  connectedText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.status.success.text,
  },
  connectButton: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  connectText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.ink,
  },
  disconnectText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  exportDescription: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: spacing.column,
  },
  exportButton: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },
  exportButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.ink,
  },
  deleteSection: {
    paddingTop: 40,
    alignItems: "center",
  },
  deleteText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.accent,
    textAlign: "center",
  },
  deleteDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.tight,
    lineHeight: 18,
  },
  otpInput: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    color: colors.ink,
    borderBottomWidth: 2,
    borderBottomColor: colors.rule,
    paddingVertical: 12,
    marginVertical: spacing.column,
    width: 200,
    alignSelf: "center",
  },
  confirmDeleteButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: "center",
    marginTop: spacing.gutter,
  },
  confirmDeleteText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: "#fff",
    textAlign: "center",
  },
});
