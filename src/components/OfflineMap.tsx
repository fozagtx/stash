import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { SAN_JUAN_BUNDLE } from "../data/sanJuanBundle";
import type { Coordinates, MapMarker, PoiType, SpatialResult } from "../types";

const WIDTH = 340;
const HEIGHT = 238;

const POI_COLORS: Record<PoiType, string> = {
  clinic: "#2E7D5B",
  hospital: "#B9403A",
  pharmacy: "#7A4EB3",
  shelter: "#C07B22",
  school: "#2F6F9F",
  market: "#7B6D1F",
  fuel: "#3F555F",
  police: "#264E86",
};

function project(point: Coordinates) {
  const { bounds } = SAN_JUAN_BUNDLE;
  const x = ((point.longitude - bounds.west) / (bounds.east - bounds.west)) * WIDTH;
  const y = ((bounds.north - point.latitude) / (bounds.north - bounds.south)) * HEIGHT;
  return {
    x: Math.min(WIDTH - 12, Math.max(12, x)),
    y: Math.min(HEIGHT - 12, Math.max(12, y)),
  };
}

function markerColor(marker: MapMarker) {
  if (marker.kind === "origin") return "#111111";
  return marker.poiType ? POI_COLORS[marker.poiType] : "#2E7D5B";
}

type Props = {
  result: SpatialResult;
};

export function OfflineMap({ result }: Props) {
  const routePoints =
    result.route?.polyline.map((point) => {
      const projected = project(point);
      return `${projected.x},${projected.y}`;
    }) ?? [];

  return (
    <View style={styles.shell}>
      <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" accessibilityLabel="Offline local map">
        <Rect x="0" y="0" width={WIDTH} height={HEIGHT} rx="8" fill="#F4F0E8" />
        <Line x1="22" y1="52" x2="318" y2="54" stroke="#C8BFAF" strokeWidth="2" />
        <Line x1="42" y1="190" x2="302" y2="108" stroke="#D4CAB8" strokeWidth="2" />
        <Line x1="76" y1="24" x2="100" y2="218" stroke="#D4CAB8" strokeWidth="2" />
        <Line x1="190" y1="20" x2="214" y2="218" stroke="#D4CAB8" strokeWidth="2" />
        <SvgText x="18" y="26" fill="#6A6257" fontSize="10" fontWeight="600">
          Old San Juan
        </SvgText>
        <SvgText x="176" y="42" fill="#6A6257" fontSize="10" fontWeight="600">
          Condado
        </SvgText>
        <SvgText x="248" y="82" fill="#6A6257" fontSize="10" fontWeight="600">
          Ocean Park
        </SvgText>
        <SvgText x="150" y="184" fill="#6A6257" fontSize="10" fontWeight="600">
          Hato Rey
        </SvgText>

        {routePoints.length > 1 ? (
          <Polyline
            points={routePoints.join(" ")}
            fill="none"
            stroke="#D04F3A"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        ) : null}

        {result.markers.map((marker, index) => {
          const projected = project(marker.coordinates);
          const color = markerColor(marker);
          return (
            <React.Fragment key={marker.id}>
              <Circle cx={projected.x} cy={projected.y} r={marker.kind === "origin" ? 8 : 7} fill="#FFFFFF" />
              <Circle cx={projected.x} cy={projected.y} r={marker.kind === "origin" ? 5 : 4.5} fill={color} />
              <SvgText
                x={projected.x + 8}
                y={projected.y - 8 + index * 2}
                fill="#24231F"
                fontSize="9"
                fontWeight="700"
              >
                {marker.kind === "origin" ? "Origin" : marker.label.split(" ").slice(0, 2).join(" ")}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    aspectRatio: WIDTH / HEIGHT,
    borderRadius: 8,
    overflow: "hidden",
    borderColor: "#2C2B27",
    borderWidth: 1,
    backgroundColor: "#F4F0E8",
  },
});
