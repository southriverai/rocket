// Solid propellant types: energy density (J/kg) and density (kg/L)

import type { SolidFuelType } from './simTypes';

export type { SolidFuelType };
export interface SolidFuelProps {
  /** Specific energy in J/kg */
  energyDensityJkg: number;
  /** Density in kg/L (1 L = 0.001 m³) */
  densityKgL: number;
  label: string;
}

export const SOLID_FUEL_PROPS: Record<SolidFuelType, SolidFuelProps> = {
  'black-powder': {
    energyDensityJkg: 2.8e6,
    densityKgL: 1.05,
    label: 'Black powder',
  },
  'ammonium-perchlorate': {
    energyDensityJkg: 4.5e6,
    densityKgL: 1.70,
    label: 'Ammonium perchlorate',
  },
};

export const SOLID_FUEL_TYPES: SolidFuelType[] = ['black-powder', 'ammonium-perchlorate'];

export function getSolidFuelProps(type: SolidFuelType): SolidFuelProps {
  return SOLID_FUEL_PROPS[type];
}

/** Tank volume in L for a given fuel mass (kg) and solid fuel type. */
export function fuelMassToVolumeL(fuelMassKg: number, solidFuelType: SolidFuelType): number {
  const { densityKgL } = SOLID_FUEL_PROPS[solidFuelType];
  return fuelMassKg / densityKgL;
}
