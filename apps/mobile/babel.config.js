// Babel config for Expo Router + Lingui macros.
// This file did not exist before BLI-280; Reanimated 4 + worklets handle their
// own codegen without a babel plugin, so the project was running on Expo's
// auto-resolved preset. Lingui's macros require us to opt into a config — once
// the file exists, we have to keep babel-preset-expo as the preset explicitly.
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["@lingui/babel-plugin-lingui-macro"],
  };
};
