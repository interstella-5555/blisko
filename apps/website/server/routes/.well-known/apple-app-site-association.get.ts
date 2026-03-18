import { IOS_BUNDLE_ID } from "@/config";

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [`TEAMID.${IOS_BUNDLE_ID}`], // TODO: replace TEAMID with real Apple Team ID
        paths: ["/join/*"],
      },
    ],
  },
};

export default () => AASA;
