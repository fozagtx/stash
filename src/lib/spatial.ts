import { SAN_JUAN_BUNDLE } from "../data/sanJuanBundle";
import type {
  Coordinates,
  MapMarker,
  Place,
  Poi,
  PoiType,
  SpatialResult,
  SpatialToolArgs,
  SpatialToolName,
} from "../types";

const TYPE_LABELS: Record<PoiType, string> = {
  clinic: "clinics",
  hospital: "hospitals",
  pharmacy: "pharmacies",
  shelter: "shelters",
  school: "schools",
  market: "markets",
  fuel: "fuel stations",
  police: "police stations",
};

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function distanceMeters(a: Coordinates, b: Coordinates) {
  const earthRadius = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(meters: number) {
  if (meters < 950) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function resolvePlace(input?: string): Place {
  const target = normalize(input || "");
  if (!target) return SAN_JUAN_BUNDLE.places.find((place) => place.id === "camp-6")!;

  const matches = SAN_JUAN_BUNDLE.places
    .map((place) => {
      const aliases = [place.name, ...place.aliases].map(normalize);
      const best = aliases
        .filter((alias) => target.includes(alias) || alias.includes(target))
        .sort((a, b) => b.length - a.length)[0];
      return { place, score: best?.length ?? 0 };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  return matches[0]?.place ?? SAN_JUAN_BUNDLE.places.find((place) => place.id === "camp-6")!;
}

export function resolvePoiType(input?: string): PoiType | undefined {
  const text = normalize(input || "");
  const map: Array<[PoiType, string[]]> = [
    ["hospital", ["hospital", "er", "emergency room"]],
    ["clinic", ["clinic", "doctor", "medical", "health"]],
    ["pharmacy", ["pharmacy", "pharmacies", "medicine", "medication", "drugstore"]],
    ["shelter", ["shelter", "evacuation", "safe place"]],
    ["school", ["school", "schools"]],
    ["market", ["market", "food", "groceries", "grocery"]],
    ["fuel", ["fuel", "gas", "petrol"]],
    ["police", ["police", "security"]],
  ];
  return map.find(([, words]) => words.some((word) => text.includes(word)))?.[0];
}

function makeRoute(origin: Coordinates, destination: Coordinates) {
  const meters = distanceMeters(origin, destination) * 1.28;
  const durationMinutes = Math.max(3, Math.round(meters / 78));
  const midA = {
    latitude: origin.latitude + (destination.latitude - origin.latitude) * 0.36 + 0.0012,
    longitude: origin.longitude + (destination.longitude - origin.longitude) * 0.36,
  };
  const midB = {
    latitude: origin.latitude + (destination.latitude - origin.latitude) * 0.68,
    longitude: origin.longitude + (destination.longitude - origin.longitude) * 0.68 - 0.001,
  };

  return {
    distanceMeters: Math.round(meters),
    durationMinutes,
    polyline: [origin, midA, midB, destination],
    steps: [
      { instruction: "Walk toward the main avenue", distanceMeters: Math.round(meters * 0.28) },
      { instruction: "Continue through the marked local corridor", distanceMeters: Math.round(meters * 0.44) },
      { instruction: "Turn toward the destination entrance", distanceMeters: Math.round(meters * 0.28) },
    ],
  };
}

function poiMarker(poi: Poi): MapMarker {
  return {
    id: poi.id,
    label: poi.name,
    kind: "poi",
    coordinates: poi.coordinates,
    poiType: poi.type,
  };
}

function originMarker(place: Place): MapMarker {
  return {
    id: place.id,
    label: place.name,
    kind: "origin",
    coordinates: place.coordinates,
  };
}

function baseEvidence(startedAt: number, model?: SpatialResult["evidence"]["model"]) {
  return {
    cityBundle: SAN_JUAN_BUNDLE.name,
    dataSource: "Bundled offline San Juan sample data",
    model,
    latencyMs: Date.now() - startedAt,
  };
}

export function executeSpatialTool(
  toolName: SpatialToolName,
  args: SpatialToolArgs,
  query: string,
  mode: SpatialResult["mode"],
  model?: SpatialResult["evidence"]["model"],
  stats?: Pick<SpatialResult["evidence"], "tokensPerSecond" | "backendDevice">,
): SpatialResult {
  const startedAt = Date.now();
  const origin = resolvePlace(args.place);
  const poiType = args.poiType ? resolvePoiType(args.poiType) ?? args.poiType : undefined;

  if (toolName === "geocode_place") {
    return {
      id: `${Date.now()}-geocode`,
      query,
      toolName,
      mode,
      title: origin.name,
      summary: `${origin.name}: ${origin.coordinates.latitude.toFixed(4)}, ${origin.coordinates.longitude.toFixed(4)}`,
      origin,
      markers: [originMarker(origin)],
      evidence: { ...baseEvidence(startedAt, model), ...stats },
    };
  }

  if (toolName === "list_pois") {
    const radiusKm = args.radiusKm ?? 2;
    const matches = SAN_JUAN_BUNDLE.pois
      .filter((poi) => !poiType || poi.type === poiType)
      .map((poi) => ({ poi, distance: distanceMeters(origin.coordinates, poi.coordinates) }))
      .filter((item) => item.distance <= radiusKm * 1000)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);

    const label = poiType ? TYPE_LABELS[poiType] : "points of interest";
    return {
      id: `${Date.now()}-list`,
      query,
      toolName,
      mode,
      title: `${matches.length} ${label} near ${origin.name}`,
      summary:
        matches.length > 0
          ? matches.map(({ poi, distance }) => `${poi.name} (${formatDistance(distance)})`).join(" | ")
          : `No ${label} found within ${radiusKm} km of ${origin.name}.`,
      origin,
      markers: [originMarker(origin), ...matches.map(({ poi }) => poiMarker(poi))],
      evidence: { ...baseEvidence(startedAt, model), ...stats },
    };
  }

  const candidates = SAN_JUAN_BUNDLE.pois
    .filter((poi) => !poiType || poi.type === poiType)
    .map((poi) => ({ poi, distance: distanceMeters(origin.coordinates, poi.coordinates) }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];

  if (!nearest) {
    const label = poiType ? TYPE_LABELS[poiType] : "points of interest";
    return {
      id: `${Date.now()}-empty`,
      query,
      toolName,
      mode,
      title: `No ${label} found`,
      summary: `The local bundle has no matching ${label}.`,
      origin,
      markers: [originMarker(origin)],
      evidence: { ...baseEvidence(startedAt, model), ...stats },
    };
  }

  const route = makeRoute(origin.coordinates, nearest.poi.coordinates);
  return {
    id: `${Date.now()}-nearest`,
    query,
    toolName,
    mode,
    title: `${nearest.poi.name}`,
    summary: `${formatDistance(route.distanceMeters)} walk from ${origin.name}; about ${route.durationMinutes} minutes.`,
    origin,
    markers: [originMarker(origin), poiMarker(nearest.poi)],
    route,
    evidence: { ...baseEvidence(startedAt, model), ...stats },
  };
}

export function inferToolFromQuery(query: string): { toolName: SpatialToolName; args: SpatialToolArgs } {
  const text = normalize(query);
  const place = resolvePlace(text).name;
  const poiType = resolvePoiType(text);
  const radiusMatch = text.match(/within\s+(\d+(?:\.\d+)?)\s*(km|kilometer|kilometers|m|meter|meters)/);
  const radiusKm = radiusMatch
    ? radiusMatch[2].startsWith("m")
      ? Number(radiusMatch[1]) / 1000
      : Number(radiusMatch[1])
    : undefined;

  if (text.startsWith("where is") || text.includes("coordinates") || text.includes("geocode")) {
    return { toolName: "geocode_place", args: { place } };
  }

  if (text.includes("list") || text.includes("within") || text.includes("nearby")) {
    return { toolName: "list_pois", args: { place, poiType, radiusKm: radiusKm ?? 2 } };
  }

  return { toolName: "find_nearest_poi_with_route", args: { place, poiType: poiType ?? "hospital" } };
}

export function runLocalQuery(query: string): SpatialResult {
  const plan = inferToolFromQuery(query);
  return executeSpatialTool(plan.toolName, plan.args, query, "local", "Deterministic local router");
}
