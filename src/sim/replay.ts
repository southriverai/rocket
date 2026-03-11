// Replay recording, serialization, and checkpointing

import type {
  ReplayBundle,
  EventLogItem,
  RocketDesign,
  SimParams,
  TelemetrySample,
} from './simTypes';
import { serializeSimState } from './serialization';

export function createReplayBundle(
  rocketDesign: RocketDesign,
  events: EventLogItem[],
  checkpoints: Array<{ t: number; state: any }>,
  seed: number,
  dt: number,
  simParams: SimParams,
  cachedTelemetry?: TelemetrySample[]
): ReplayBundle {
  const designHash = hashRocketDesign(rocketDesign);
  
  // Serialize checkpoints (if not already serialized)
  const serializedCheckpoints = checkpoints.map(cp => {
    if (cp.state && typeof cp.state === 'object' && cp.state.activeParts instanceof Set) {
      return {
        t: cp.t,
        state: serializeSimState(cp.state),
      };
    }
    // Already serialized or invalid - cast to expected type
    return {
      t: cp.t,
      state: cp.state,
    };
  }) as ReplayBundle['checkpoints'];
  
  return {
    metadata: {
      schemaVersion: '1.0.0',
      createdAt: Date.now(),
      seed,
      dt,
      simParams,
      rocketDesignHash: designHash,
    },
    rocketDesign,
    events,
    checkpoints: serializedCheckpoints,
    cachedDownsampledTelemetry: cachedTelemetry,
  };
}

export function hashRocketDesign(design: RocketDesign): string {
  const data = design.stages?.length
    ? design.stages.map((s) => ({ stageType: s.stageType, solidFuelType: s.solidFuelType, engineType: s.engineType, fuelMass: s.fuelMass, thrust: s.thrust, isp: s.isp, material: s.material, elongation: s.elongation, frictionCoeff: s.frictionCoeff, aerodynamics: s.aerodynamics }))
    : (design.parts ?? []).map((p) => ({ type: p.type, mass: p.mass, fuelMass: p.fuelMass, material: p.material, thrust: p.thrust, isp: p.isp }));
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export function serializeReplay(bundle: ReplayBundle): string {
  return JSON.stringify(bundle);
}

export function deserializeReplay(data: string): ReplayBundle {
  return JSON.parse(data) as ReplayBundle;
}

export function findNearestCheckpoint(
  checkpoints: ReplayBundle['checkpoints'],
  t: number
): ReplayBundle['checkpoints'][0] | null {
  if (checkpoints.length === 0) return null;
  
  // Binary search for nearest checkpoint <= t
  let left = 0;
  let right = checkpoints.length - 1;
  let best: ReplayBundle['checkpoints'][0] | null = null;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const checkpoint = checkpoints[mid];
    
    if (checkpoint.t <= t) {
      best = checkpoint;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return best;
}
