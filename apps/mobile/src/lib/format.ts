export const formatDistance = (meters: number): string => {
  if (meters < 50) return 'tuż obok';
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) return `~${rounded} m`;
  return `~${(rounded / 1000).toFixed(1)} km`;
};
