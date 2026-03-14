// Rocket model: compute mass, thrust, drag, staging

import type { RocketDesign, SimState, SimParams, Part } from './simTypes';
import { AERODYNAMICS_COEFF } from './simTypes';
import { getTankDryMass } from './materials';
import { getEngineProps } from './engines';
import { SOLID_FUEL_PROPS, fuelMassToVolumeL } from './solidFuels';
import { radiusFromVolumeAndElongation, crossSectionAreaFromRadius } from './tankGeometry';

const G0 = 9.81;

/** Convert design stages to part list for the sim. Uses computed thrust (F = m_dot * v_e) and Isp = v_e/g0 when available. */
export function designToParts(design: RocketDesign): Part[] {
  if (!design.stages?.length) return [];
  const stats = computeStageStats(design);
  const parts: Part[] = [];
  const massFactor = Math.max(1, Math.min(5, design.overEngineeringFactor ?? 1));
  design.stages.forEach((stage, i) => {
    const material = design.structureMaterial ?? stage.material;
    const elongation = design.structureElongation ?? stage.elongation ?? 1;
    const aero = design.structureAerodynamics ?? stage.aerodynamics ?? 'cone';
    const tankDry =
      (material
        ? getTankDryMass(stage.fuelMass, material)
        : Math.max(10, stage.fuelMass * 0.1)) * massFactor;
    const volumeL = fuelMassToVolumeL(stage.fuelMass, stage.solidFuelType ?? 'black-powder');
    const R = radiusFromVolumeAndElongation(volumeL, elongation);
    const crossSection = crossSectionAreaFromRadius(R);
    const frictionCoeff =
      stage.frictionCoeff ??
      (aero ? AERODYNAMICS_COEFF[aero] : 0.5);
    parts.push({
      id: `${stage.id}-tank`,
      type: 'tank',
      mass: tankDry,
      fuelMass: stage.fuelMass,
      material: material ?? 'steel',
      crossSection,
      frictionCoeff,
    });
    const engineType = stage.engineType ?? 'basic-exhaust';
    const engine = getEngineProps(engineType);
    const s = stats[i];
    const thrust = s.thrust > 0 ? s.thrust : (stage.thrust ?? engine.thrust);
    const isp = s.exhaustVelocity > 0 ? s.exhaustVelocity / G0 : (stage.isp ?? engine.isp);
    parts.push({
      id: `${stage.id}-engine`,
      type: 'engine',
      mass: engine.massKg * massFactor,
      thrust,
      isp,
      throttleable: true,
    });
  });
  return parts;
}

/** Part IDs per stage for buildStages. */
export function getStageIds(design: RocketDesign): string[][] {
  if (!design.stages?.length) return [];
  return design.stages.map((s) => [`${s.id}-tank`, `${s.id}-engine`]);
}

export interface StageStats {
  dryMass: number;   // kg
  wetMass: number;  // kg
  burnDuration: number; // s
  /** Exhaust velocity (m/s) from ideal energy-limited case: v_e = sqrt(2 * eta * E_specific). */
  exhaustVelocity: number;
  /** Thrust (N) from F = m_dot * v_e (burn rate in kg/s × exhaust velocity). */
  thrust: number;
  /** Acceleration at takeoff (m/s²): thrust/wetMass - g. */
  accelerationAtTakeoff: number;
  /** Delta-v (m/s) from rocket equation: v_e * ln(wetMass/dryMass). */
  deltaV: number;
}

/** Compute per-stage dry mass, wet mass, and burn duration from design. */
export function computeStageStats(design: RocketDesign): StageStats[] {
  if (!design.stages?.length) return [];
  const massFactor = Math.max(1, Math.min(5, design.overEngineeringFactor ?? 1));
  return design.stages.map((stage) => {
    const material = design.structureMaterial ?? stage.material;
    const tankDry =
      (material
        ? getTankDryMass(stage.fuelMass, material)
        : Math.max(10, stage.fuelMass * 0.1)) * massFactor;
    const engine = getEngineProps(stage.engineType ?? 'basic-exhaust');
    const dryMass = tankDry + engine.massKg * massFactor;
    const wetMass = dryMass + stage.fuelMass;
    const solidFuel =
      (stage.stageType ?? 'solid') === 'solid'
        ? SOLID_FUEL_PROPS[stage.solidFuelType ?? 'black-powder']
        : null;
    const burnRateLs = Math.max(
      0,
      Math.min(1, stage.burnRateOverrideLs ?? engine.burnRateLs)
    );
    const burnRateKgPerS =
      solidFuel && stage.fuelMass > 0 ? burnRateLs * solidFuel.densityKgL : 0;
    const burnDuration = burnRateKgPerS > 0 ? stage.fuelMass / burnRateKgPerS : 0;
    // Ideal energy-limited exhaust velocity: (1/2) v_e^2 = eta * E_specific => v_e = sqrt(2 * eta * E)
    const exhaustVelocity = solidFuel
      ? Math.sqrt(2 * engine.efficiency * solidFuel.energyDensityJkg)
      : 0;
    // Thrust F = m_dot * v_e (mass flow rate kg/s × exhaust velocity m/s => N)
    const thrust = burnRateKgPerS > 0 && exhaustVelocity > 0 ? burnRateKgPerS * exhaustVelocity : (stage.thrust ?? engine.thrust);
    // Acceleration at takeoff: a = F/m - g (thrust/wetMass - gravity)
    const accelerationAtTakeoff = wetMass > 0 ? thrust / wetMass - G0 : 0;
    // Delta-v (rocket equation): Δv = v_e * ln(m_wet / m_dry)
    const deltaV =
      exhaustVelocity > 0 && dryMass > 0 && wetMass > dryMass
        ? exhaustVelocity * Math.log(wetMass / dryMass)
        : 0;
    return { dryMass, wetMass, burnDuration, exhaustVelocity, thrust, accelerationAtTakeoff, deltaV };
  });
}

/** Total delta-v (m/s) for the design (sum of all stages). */
export function getTotalDeltaV(design: RocketDesign): number {
  const stats = computeStageStats(design);
  return stats.reduce((sum, s) => sum + s.deltaV, 0);
}

/** Total burn duration (sum of all stage burn times, sequential). */
export function getTotalBurnDuration(design: RocketDesign): number {
  const stats = computeStageStats(design);
  return stats.reduce((sum, s) => sum + s.burnDuration, 0);
}

function getPartDryMass(part: Part): number {
  // Part mass already includes any over-engineering factor; treat it as dry mass.
  return part.mass;
}

/** Current total mass (kg) = dry mass of active parts + remaining fuel. */
export function computeRocketMass(
  design: RocketDesign,
  activeParts: Set<string>,
  fuelRemaining: number
): number {
  const parts = design.parts ?? [];
  let dryMass = 0;
  for (const part of parts) {
    if (activeParts.has(part.id)) {
      dryMass += getPartDryMass(part);
    }
  }
  return dryMass + Math.max(0, fuelRemaining);
}

export function computeCurrentFuel(design: RocketDesign, activeParts: Set<string>, fuelRemaining: number): number {
  let totalCapacity = 0;
  let currentFuel = 0;
  
  const parts = design.parts ?? [];
  for (const part of parts) {
    if (activeParts.has(part.id) && part.type === 'tank' && part.fuelMass) {
      totalCapacity += part.fuelMass;
    }
  }
  
  // Distribute fuel proportionally (simplified)
  // In reality, fuel would be tracked per tank
  if (totalCapacity > 0) {
    currentFuel = Math.max(0, Math.min(totalCapacity, fuelRemaining));
  }
  
  return currentFuel;
}

export function computeThrust(
  design: RocketDesign,
  activeParts: Set<string>,
  throttle: number,
  currentFuel: number
): number {
  let totalThrust = 0;
  const parts = design.parts ?? [];
  const stages = design.stages ?? [];

  // Compute total fuel capacity for active stages
  let totalCapacity = 0;
  for (const stage of stages) {
    const tankId = `${stage.id}-tank`;
    if (activeParts.has(tankId)) {
      const part = parts.find((p) => p.id === tankId);
      if (part?.fuelMass) totalCapacity += part.fuelMass;
    }
  }

  const fuelRemaining = Math.max(0, currentFuel);
  const fuelUsed = Math.max(0, totalCapacity - fuelRemaining);

  for (const stage of stages) {
    const tankId = `${stage.id}-tank`;
    const engineId = `${stage.id}-engine`;
    if (!activeParts.has(tankId) || !activeParts.has(engineId)) continue;
    const enginePart = parts.find((p) => p.id === engineId);
    if (!enginePart?.thrust || !enginePart.isp) continue;

    // Per-stage capacity: tank fuelMass
    const stageCapacity =
      parts.find((p) => p.id === tankId && p.fuelMass != null)?.fuelMass ?? 0;
    if (stageCapacity <= 0) continue;

    // Approximate how much of this stage's fuel has been used
    const stageStartFuel = Math.max(0, totalCapacity - stageCapacity);
    const stageFuelUsed = Math.max(
      0,
      Math.min(stageCapacity, fuelUsed - stageStartFuel)
    );
    const stageFuelRemaining = Math.max(0, stageCapacity - stageFuelUsed);

    let burndownMultiplier = 1;
    const burndownTime = Math.max(0, Math.min(20, stage.burndownTime ?? 0));
    if (burndownTime > 0 && stageCapacity > 0) {
      const engine = getEngineProps(stage.engineType ?? 'basic-exhaust');
      const solidFuel =
        (stage.stageType ?? 'solid') === 'solid'
          ? SOLID_FUEL_PROPS[stage.solidFuelType ?? 'black-powder']
          : null;
      const burnRateLs = Math.max(
        0,
        Math.min(1, stage.burnRateOverrideLs ?? engine.burnRateLs)
      );
      const burnRateKgPerS =
        solidFuel && stage.fuelMass > 0 ? burnRateLs * solidFuel.densityKgL : 0;
      const burnDuration =
        burnRateKgPerS > 0 ? stageCapacity / burnRateKgPerS : 0;
      if (burnDuration > 0 && stageFuelRemaining <= burndownTime * (stageCapacity / burnDuration)) {
        const tRemaining = (stageFuelRemaining / stageCapacity) * burnDuration;
        burndownMultiplier = Math.max(0, Math.min(1, tRemaining / burndownTime));
      }
    }

    if (stageFuelRemaining > 0) {
      const effectiveThrottle = enginePart.throttleable !== false ? throttle : 1.0;
      totalThrust += enginePart.thrust * effectiveThrottle * burndownMultiplier;
    }
  }

  return totalThrust;
}

export function computeFuelConsumption(
  design: RocketDesign,
  activeParts: Set<string>,
  throttle: number,
  dt: number
): number {
  let totalConsumption = 0;
  
  const parts = design.parts ?? [];
  for (const part of parts) {
    if (activeParts.has(part.id) && part.type === 'engine' && part.thrust && part.isp) {
      const effectiveThrottle = part.throttleable !== false ? throttle : 1.0;
      const g0 = 9.81;
      const fuelFlow = (part.thrust * effectiveThrottle) / (part.isp * g0);
      totalConsumption += fuelFlow * dt;
    }
  }
  
  return totalConsumption;
}

export function buildStages(design: RocketDesign): string[][] {
  if (design._stageIds?.length) return design._stageIds;
  const parts = design.parts ?? [];
  if (parts.length === 0) return [];
  return [parts.map((p) => p.id)];
}

/** Effective drag area (m²) = crossSection × frictionCoeff of the frontal (first active) stage. */
function getCurrentDragArea(design: RocketDesign, activeParts: Set<string>): number {
  const parts = design.parts ?? [];
  const stages = design.stages ?? [];
  for (let i = 0; i < stages.length; i++) {
    const tankId = `${stages[i].id}-tank`;
    if (activeParts.has(tankId)) {
      const part = parts.find((p) => p.id === tankId);
      if (part?.crossSection != null && part?.frictionCoeff != null) {
        return part.crossSection * part.frictionCoeff;
      }
      break;
    }
  }
  return 0;
}

export function updateRocketState(
  design: RocketDesign,
  state: SimState,
  params: SimParams
): SimState {
  // Compute current fuel (remaining)
  const currentFuel = computeCurrentFuel(design, state.activeParts, state.currentFuel);
  // Mass = dry mass + remaining fuel (decreases as fuel burns)
  const currentMass = computeRocketMass(design, state.activeParts, currentFuel);
  const currentThrust = computeThrust(design, state.activeParts, state.throttle, currentFuel);
  const currentDragArea = getCurrentDragArea(design, state.activeParts) || params.dragCoeff;
  
  return {
    ...state,
    currentMass,
    currentFuel,
    currentThrust,
    currentDragArea,
  };
}

export function stageRocket(state: SimState): SimState {
  const nextStage = state.currentStage + 1;
  if (nextStage >= state.stages.length) {
    // No more stages
    return state;
  }
  
  // Remove parts from previous stages
  const newActiveParts = new Set<string>();
  for (let i = nextStage; i < state.stages.length; i++) {
    for (const partId of state.stages[i]) {
      newActiveParts.add(partId);
    }
  }
  
  return {
    ...state,
    activeParts: newActiveParts,
    currentStage: nextStage,
  };
}
