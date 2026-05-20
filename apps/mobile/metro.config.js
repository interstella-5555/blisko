// Metro config — extends Expo's default with @lingui/metro-transformer so that
// .po files can be imported directly (`import { messages } from
// "./locales/pl/messages.po"`). Without this, Lingui's typical flow would need
// a separate `lingui compile` step that emits JS bundles; the transformer
// inlines that step into Metro's bundle, so dev iteration is faster.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("@lingui/metro-transformer/expo"),
};

config.resolver = {
  ...config.resolver,
  sourceExts: [...config.resolver.sourceExts, "po", "pot"],
};

module.exports = config;
