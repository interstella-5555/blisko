import type { VariantMeta } from "./types";
import Bioluminescent, { meta as bioluminescentMeta } from "./v1-bioluminescent/Bioluminescent";
import NeoBrutalist, { meta as neoBrutalistMeta } from "./v1-neo-brutalist/NeoBrutalist";
import Topographic, { meta as topographicMeta } from "./v1-topographic/Topographic";
import Arcade, { meta as arcadeMeta } from "./v2-arcade/Arcade";
import Bauhaus, { meta as bauhausMeta } from "./v2-bauhaus/Bauhaus";
import Botanical, { meta as botanicalMeta } from "./v2-botanical/Botanical";
import Constellation, { meta as constellationMeta } from "./v2-constellation/Constellation";
import Dithered, { meta as ditheredMeta } from "./v2-dithered/Dithered";
import HauteCouture, { meta as hauteCoutureMeta } from "./v2-haute-couture/HauteCouture";
import Newspaper, { meta as newspaperMeta } from "./v2-newspaper/Newspaper";
import StreetPoster, { meta as streetPosterMeta } from "./v2-street-poster/StreetPoster";
import Transit, { meta as transitMeta } from "./v2-transit/Transit";
import WeatherMap, { meta as weatherMapMeta } from "./v2-weather-map/WeatherMap";

export const variants: Array<{
  component: React.ComponentType;
  meta: VariantMeta;
}> = [
  { component: NeoBrutalist, meta: neoBrutalistMeta },
  { component: Topographic, meta: topographicMeta },
  { component: Bioluminescent, meta: bioluminescentMeta },
  { component: Newspaper, meta: newspaperMeta },
  { component: Transit, meta: transitMeta },
  { component: WeatherMap, meta: weatherMapMeta },
  { component: Dithered, meta: ditheredMeta },
  { component: Botanical, meta: botanicalMeta },
  { component: Bauhaus, meta: bauhausMeta },
  { component: StreetPoster, meta: streetPosterMeta },
  { component: Constellation, meta: constellationMeta },
  { component: HauteCouture, meta: hauteCoutureMeta },
  { component: Arcade, meta: arcadeMeta },
];
