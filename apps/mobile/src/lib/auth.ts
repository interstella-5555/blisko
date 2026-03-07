import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "blisko",
      storagePrefix: "blisko",
      storage: SecureStore,
    }),
    emailOTPClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
