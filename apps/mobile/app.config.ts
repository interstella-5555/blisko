import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name!,
  slug: config.slug!,
  android: {
    ...config.android,
    versionCode: Number.parseInt(process.env.GITHUB_RUN_NUMBER ?? "1", 10),
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      "react-native-maps",
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY || "",
      },
    ],
  ],
});
