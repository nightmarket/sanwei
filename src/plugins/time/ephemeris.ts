const DEG = Math.PI / 180;

function toJulian(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Approximate solar position (NOAA-style).
 * Azimuth is clockwise from north; elevation is degrees above the horizon.
 */
export function sunPosition(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): { azimuth: number; elevation: number; julianDay: number } {
  const julian = toJulian(date);
  const n = julian - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;
  const lambda = L + 1.915 * Math.sin(g * DEG) + 0.02 * Math.sin(2 * g * DEG);
  const epsilon = 23.439 - 0.0000004 * n;
  const alpha =
    Math.atan2(Math.cos(epsilon * DEG) * Math.sin(lambda * DEG), Math.cos(lambda * DEG)) / DEG;
  const delta = Math.asin(Math.sin(epsilon * DEG) * Math.sin(lambda * DEG)) / DEG;

  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst + longitude / 15 + 24) % 24;
  const ha = (lst * 15 - alpha + 360) % 360;

  const lat = latitude * DEG;
  const haRad = ha * DEG;
  const dec = delta * DEG;

  const elevation =
    Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(haRad)) /
    DEG;
  const azimuth =
    (Math.atan2(
      Math.sin(haRad),
      Math.cos(haRad) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)
    ) /
      DEG +
      180) %
    360;

  return { azimuth, elevation, julianDay: julian };
}

/** Map elevation to a 0–1 day-cycle progress (0.5 ≈ solar noon, 0/1 ≈ midnight). */
export function sunProgress(latitude: number, longitude: number, date: Date = new Date()) {
  const { elevation } = sunPosition(latitude, longitude, date);
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const clock = minutes / 1440;
  const elevNorm = (elevation + 90) / 180;
  return (clock * 0.65 + elevNorm * 0.35) % 1;
}
