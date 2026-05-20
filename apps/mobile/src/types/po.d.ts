// Lingui PO files are loaded via @lingui/metro-transformer (see metro.config.js).
// The transformer turns each .po file into an ES module exporting `messages`.
declare module "*.po" {
  export const messages: Record<string, string>;
}
