export const BUSINESS_LAT = 28.40638190515019;
export const BUSINESS_LNG = 77.08898189075938;
export const SERVICE_RADIUS_KM = 10;

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function distanceFromBusinessKm(lat: number, lng: number): number {
  return haversineDistanceKm(lat, lng, BUSINESS_LAT, BUSINESS_LNG);
}

export function isWithinServiceArea(lat: number, lng: number): boolean {
  return distanceFromBusinessKm(lat, lng) <= SERVICE_RADIUS_KM;
}
