const ANDROID_PACKAGE = "com.blisko.app";

const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: [], // TODO: add real fingerprints
    },
  },
];

export default () => ASSET_LINKS;
