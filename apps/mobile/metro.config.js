// Metro config — Expo defaults + monorepo (Bun workspace) module resolution
// + @lingui/metro-transformer so PO files import as ES modules.
//
// Bun (and Yarn) workspaces hoist most packages to the workspace-root
// node_modules/. Metro's default project-rooted resolver only looks inside
// apps/mobile/node_modules/, so without watchFolders + nodeModulesPaths it
// fails to find expo-router (and basically every other workspace dep) on
// startup. See https://docs.expo.dev/guides/monorepos/ for the canonical
// pattern. We followed it before BLI-280 implicitly via Expo's default; now
// that we own metro.config.js we have to spell it out.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [path.resolve(projectRoot, "node_modules"), path.resolve(workspaceRoot, "node_modules")],
  sourceExts: [...config.resolver.sourceExts, "po", "pot"],
};

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("@lingui/metro-transformer/expo"),
};

module.exports = config;
