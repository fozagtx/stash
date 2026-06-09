export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type Place = {
  id: string;
  name: string;
  aliases: string[];
  coordinates: Coordinates;
};

export type PoiType =
  | "clinic"
  | "hospital"
  | "pharmacy"
  | "shelter"
  | "school"
  | "market"
  | "fuel"
  | "police";

export type Poi = {
  id: string;
  name: string;
  type: PoiType;
  coordinates: Coordinates;
  address: string;
  open: boolean;
};

export type CityBundle = {
  id: string;
  name: string;
  center: Coordinates;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  places: Place[];
  pois: Poi[];
};

export type SpatialToolName =
  | "geocode_place"
  | "list_pois"
  | "find_nearest_poi_with_route";

export type SpatialToolArgs = {
  place?: string;
  poiType?: PoiType;
  radiusKm?: number;
};

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
};

export type MapMarker = {
  id: string;
  label: string;
  kind: "origin" | "poi";
  coordinates: Coordinates;
  poiType?: PoiType;
};

export type SpatialResult = {
  id: string;
  query: string;
  toolName: SpatialToolName;
  mode: "qvac" | "local";
  title: string;
  summary: string;
  origin?: Place;
  markers: MapMarker[];
  route?: {
    distanceMeters: number;
    durationMinutes: number;
    polyline: Coordinates[];
    steps: RouteStep[];
  };
  evidence: {
    cityBundle: string;
    dataSource: string;
    model?: string;
    latencyMs: number;
    tokensPerSecond?: number;
    backendDevice?: string;
  };
};

export type QvacState = {
  modelId: string | null;
  status: "idle" | "downloading" | "loading" | "ready" | "error";
  message: string;
  progress: number | null;
};
