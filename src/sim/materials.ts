// Casing material properties: tank dry weight as a function of material and fuel capacity

import type { Material } from './simTypes';

/** Casing dry mass per kg of fuel capacity (mass ratio). Heavier materials = higher dry mass. */
export const TANK_DRY_MASS_PER_KG_FUEL: Record<Material, number> = {
  steel: 0.18,   // heavy, strong
  paper: 0.02,   // very light, weak
  plastic: 0.06, // light
  carbon: 0.04,  // light and strong
};

/** Approximate structural load limit per kg of dry mass (N/kg). */
export const STRUCTURAL_LOAD_LIMIT_N_PER_KG: Record<Material, number> = {
  steel: 3,      // 3 N/kg for steel
  paper: 0.5,
  plastic: 1.5,
  carbon: 2.5,
};

/** Human-readable labels for casing materials. */
export const MATERIAL_LABELS: Record<Material, string> = {
  steel: 'Steel',
  paper: 'Paper',
  plastic: 'Plastic',
  carbon: 'Carbon',
};

/** Compute casing dry mass (kg) from casing material and fuel capacity. */
export function getTankDryMass(fuelMassKg: number, material: Material): number {
  const factor = TANK_DRY_MASS_PER_KG_FUEL[material];
  return Math.max(0.1, fuelMassKg * factor); // minimum 0.1 kg so tank exists
}
