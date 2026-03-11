// Engine types: each has a burn rate (L/s) and fixed thrust/ISP for the sim

import type { EngineType } from './simTypes';

export interface EngineProps {
  label: string;
  /** Burn rate in L/s */
  burnRateLs: number;
  /** Engine dry mass in kg */
  massKg: number;
  /** Efficiency (0–1); used for ideal energy-limited exhaust velocity. */
  efficiency: number;
  /** Thrust in N (for sim) */
  thrust: number;
  /** Specific impulse in s (for sim) */
  isp: number;
}

export const ENGINE_PROPS: Record<EngineType, EngineProps> = {
  'basic-exhaust': {
    label: 'Basic exhaust',
    burnRateLs: 1,
    massKg: 1,
    efficiency: 0.55,
    thrust: 100_000,
    isp: 300,
  },
};

export const ENGINE_TYPES: EngineType[] = ['basic-exhaust'];

export function getEngineProps(type: EngineType): EngineProps {
  return ENGINE_PROPS[type];
}
