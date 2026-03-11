/**
 * Tank shape from elongation: 1 = sphere, 2–5 = capsule (height/diameter = elongation, spherical ends).
 * Volume in L, elongation in [1, 5]. Higher elongation = thinner and taller tank.
 */

/** Volume in m³ from liters. */
function volumeLToM3(volumeL: number): number {
  return volumeL * 0.001;
}

/**
 * Radius of tank in m from volume (L) and elongation.
 * elongation 1: sphere V = (4/3)πR³ → R = (3V/(4π))^(1/3)
 * elongation e: capsule, height = 2eR, V = πR³(2e - 2/3) → R = (V/(π(2e - 2/3)))^(1/3)
 */
export function radiusFromVolumeAndElongation(volumeL: number, elongation: number): number {
  const e = Math.max(1, Math.min(5, elongation));
  const V = volumeLToM3(volumeL);
  if (V <= 0) return 0;
  const R = Math.pow(V / (Math.PI * (2 * e - 2 / 3)), 1 / 3);
  return R;
}

/** Cross-sectional area (frontal area) in m²: πR² — the area of the circular cross-section of the rocket. */
export function crossSectionAreaFromRadius(radiusM: number): number {
  return Math.PI * radiusM * radiusM;
}
