// Telemetry channel registry and downsampling utilities

import type { TelemetrySample, SimState, SimParams } from './simTypes';
import { computeForces } from './physics';

/** Mechanical state derivative [dx, dy, dvx, dvy, d(rotation), d(omega)] for stability/pct computation. */
export type MechanicsDerivative = [number, number, number, number, number, number];

export function createTelemetrySample(
  state: SimState,
  params: SimParams,
  extras?: { dt: number; derivative: MechanicsDerivative }
): TelemetrySample {
  const altitude = Math.max(0, state.position.y);
  const speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2);
  const verticalSpeed = state.velocity.y;

  const forces = computeForces(state, params, altitude);
  const totalForceMag = Math.sqrt(
    forces.total.x ** 2 +
    forces.total.y ** 2
  );
  const acceleration = state.currentMass > 0 ? totalForceMag / state.currentMass : 0;

  // Air density at altitude (kg/m³)
  const airDensity = params.seaLevelDensity * Math.exp(-altitude / params.scaleHeight);

  // Drag force magnitude (N) — friction losses in flight
  const friction = Math.sqrt(forces.drag.x ** 2 + forces.drag.y ** 2);

  const twr = state.currentMass > 0
    ? state.currentThrust / (state.currentMass * params.gravity)
    : 0;

  const sample: TelemetrySample = {
    t: state.t,
    altitude,
    speed,
    verticalSpeed,
    acceleration,
    friction,
    mass: state.currentMass,
    thrust: state.currentThrust,
    twr,
    airDensity,
    structuralLoad: totalForceMag,
  };

  if (extras) {
    const { dt, derivative: deriv } = extras;
    sample.dt = dt;
    sample.pctChangePerStep = {};
    const altScale = Math.max(altitude, 1);
    if (altScale > 0) sample.pctChangePerStep.altitude = (deriv[1] / altScale) * dt;
    const vyScale = Math.max(Math.abs(verticalSpeed), 0.1);
    if (vyScale > 0) sample.pctChangePerStep.verticalSpeed = (deriv[3] / vyScale) * dt;
    if (speed > 0.1) {
      const speedDeriv = (state.velocity.x * deriv[2] + state.velocity.y * deriv[3]) / speed;
      sample.pctChangePerStep.speed = (speedDeriv / speed) * dt;
    }
    // Sim instability = largest fraction of change per timestep (convert to % only when displaying)
    let maxFraction = 0;
    for (const frac of Object.values(sample.pctChangePerStep)) {
      if (frac == null) continue;
      const abs = Math.abs(frac);
      if (abs > maxFraction) maxFraction = abs;
    }
    sample.simInstability = maxFraction;
  }

  return sample;
}

/** Largest fraction of change per timestep (0.01 = 1%); convert to % only when displaying. */
export function getSimInstability(
  state: SimState,
  _params: SimParams,
  dt: number,
  derivative: MechanicsDerivative
): number {
  const altitude = Math.max(0, state.position.y);
  const speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2);
  const verticalSpeed = state.velocity.y;
  const deriv = derivative;
  let maxFraction = 0;
  const altScale = Math.max(altitude, 1);
  if (altScale > 0) {
    const frac = Math.abs((deriv[1] / altScale) * dt);
    if (frac > maxFraction) maxFraction = frac;
  }
  const vyScale = Math.max(Math.abs(verticalSpeed), 0.1);
  if (vyScale > 0) {
    const frac = Math.abs((deriv[3] / vyScale) * dt);
    if (frac > maxFraction) maxFraction = frac;
  }
  if (speed > 0.1) {
    const speedDeriv = (state.velocity.x * deriv[2] + state.velocity.y * deriv[3]) / speed;
    const frac = Math.abs((speedDeriv / speed) * dt);
    if (frac > maxFraction) maxFraction = frac;
  }
  return maxFraction;
}

export function downsampleTelemetry(
  samples: TelemetrySample[],
  targetCount: number
): TelemetrySample[] {
  if (samples.length <= targetCount) {
    return samples;
  }
  
  const step = samples.length / targetCount;
  const result: TelemetrySample[] = [];
  
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor(i * step);
    result.push(samples[idx]);
  }
  
  // Always include last sample
  if (result[result.length - 1] !== samples[samples.length - 1]) {
    result[result.length - 1] = samples[samples.length - 1];
  }
  
  return result;
}

export function getTelemetryWindow(
  samples: TelemetrySample[],
  tStart: number,
  tEnd: number
): TelemetrySample[] {
  return samples.filter(s => s.t >= tStart && s.t <= tEnd);
}
