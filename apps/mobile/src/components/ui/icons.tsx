import Svg, { Path, Circle, Line, Polyline, Polygon } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

const defaultSize = 24;
const defaultColor = '#1A1A1A';

export function IconWave({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <Path d="M7.5 10.5C8.5 9 10.5 9 12 10.5C13.5 12 15.5 12 16.5 10.5" />
    </Svg>
  );
}

export function IconPin({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <Circle cx={12} cy={9} r={2.5} />
    </Svg>
  );
}

export function IconChat({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

export function IconPerson({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8} r={4} />
      <Path d="M20 21a8 8 0 1 0-16 0" />
    </Svg>
  );
}

export function IconCheck({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20,6 9,17 4,12" />
    </Svg>
  );
}

export function IconX({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

export function IconSend({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={22} y1={2} x2={11} y2={13} />
      <Polygon points="22,2 15,22 11,13 2,9 22,2" />
    </Svg>
  );
}

export function IconClock({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="12,6 12,12 16,14" />
    </Svg>
  );
}

export function IconArrowLeft({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={19} y1={12} x2={5} y2={12} />
      <Polyline points="12,19 5,12 12,5" />
    </Svg>
  );
}

export function IconSettings({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function IconBulletRose({ size = 12, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d="M6 1.5C6 1.5 7.5 3.5 7.5 4.5C7.5 5.5 6.8 6 6 6C5.2 6 4.5 5.5 4.5 4.5C4.5 3.5 6 1.5 6 1.5Z" fill={color} />
      <Path d="M6 10.5C6 10.5 7.5 8.5 7.5 7.5C7.5 6.5 6.8 6 6 6C5.2 6 4.5 6.5 4.5 7.5C4.5 8.5 6 10.5 6 10.5Z" fill={color} />
      <Path d="M1.5 6C1.5 6 3.5 4.5 4.5 4.5C5.5 4.5 6 5.2 6 6C6 6.8 5.5 7.5 4.5 7.5C3.5 7.5 1.5 6 1.5 6Z" fill={color} />
      <Path d="M10.5 6C10.5 6 8.5 4.5 7.5 4.5C6.5 4.5 6 5.2 6 6C6 6.8 6.5 7.5 7.5 7.5C8.5 7.5 10.5 6 10.5 6Z" fill={color} />
    </Svg>
  );
}

export function IconHeart({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

export function IconCamera({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

export function IconMap({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2 1,6" stroke={color} fill="none" />
      <Line x1={8} y1={2} x2={8} y2={18} />
      <Line x1={16} y1={6} x2={16} y2={22} />
    </Svg>
  );
}

export function IconSearch({ size = defaultSize, color = defaultColor }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}
