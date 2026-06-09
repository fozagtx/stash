import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

type IconName = "cpu" | "locate-fixed" | "map-pin" | "route" | "search" | "shield-check" | "wifi-off";

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 18, color = "#1F1D19" }: IconProps) {
  const strokeProps = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === "cpu" ? (
        <>
          <Rect x={7} y={7} width={10} height={10} rx={2} {...strokeProps} />
          <Rect x={10} y={10} width={4} height={4} rx={1} {...strokeProps} />
          <Line x1={4} y1={9} x2={7} y2={9} {...strokeProps} />
          <Line x1={4} y1={15} x2={7} y2={15} {...strokeProps} />
          <Line x1={17} y1={9} x2={20} y2={9} {...strokeProps} />
          <Line x1={17} y1={15} x2={20} y2={15} {...strokeProps} />
          <Line x1={9} y1={4} x2={9} y2={7} {...strokeProps} />
          <Line x1={15} y1={4} x2={15} y2={7} {...strokeProps} />
          <Line x1={9} y1={17} x2={9} y2={20} {...strokeProps} />
          <Line x1={15} y1={17} x2={15} y2={20} {...strokeProps} />
        </>
      ) : null}

      {name === "locate-fixed" ? (
        <>
          <Circle cx={12} cy={12} r={5} {...strokeProps} />
          <Line x1={12} y1={2} x2={12} y2={5} {...strokeProps} />
          <Line x1={12} y1={19} x2={12} y2={22} {...strokeProps} />
          <Line x1={2} y1={12} x2={5} y2={12} {...strokeProps} />
          <Line x1={19} y1={12} x2={22} y2={12} {...strokeProps} />
        </>
      ) : null}

      {name === "map-pin" ? (
        <>
          <Path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" {...strokeProps} />
          <Circle cx={12} cy={10} r={2.5} {...strokeProps} />
        </>
      ) : null}

      {name === "route" ? (
        <>
          <Circle cx={6} cy={19} r={2} {...strokeProps} />
          <Circle cx={18} cy={5} r={2} {...strokeProps} />
          <Path d="M8 19h4a4 4 0 0 0 0-8h-1a4 4 0 0 1 0-8h5" {...strokeProps} />
        </>
      ) : null}

      {name === "search" ? (
        <>
          <Circle cx={11} cy={11} r={7} {...strokeProps} />
          <Line x1={16.5} y1={16.5} x2={21} y2={21} {...strokeProps} />
        </>
      ) : null}

      {name === "shield-check" ? (
        <>
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" {...strokeProps} />
          <Polyline points="8.5 12 11 14.5 16 9.5" {...strokeProps} />
        </>
      ) : null}

      {name === "wifi-off" ? (
        <>
          <Line x1={3} y1={3} x2={21} y2={21} {...strokeProps} />
          <Path d="M8.5 16.5a5 5 0 0 1 7 0" {...strokeProps} />
          <Path d="M5.5 13.5a9 9 0 0 1 4.5-2.2" {...strokeProps} />
          <Path d="M14 11.4a9 9 0 0 1 4.5 2.1" {...strokeProps} />
          <Path d="M2.5 10.5a14 14 0 0 1 4.1-2.6" {...strokeProps} />
          <Path d="M17.4 7.9a14 14 0 0 1 4.1 2.6" {...strokeProps} />
          <Circle cx={12} cy={20} r={1.2} fill={color} stroke="none" />
        </>
      ) : null}
    </Svg>
  );
}
