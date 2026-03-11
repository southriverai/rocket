// Serialization helpers for SimState (handles Set conversion)

import type { SimState, Checkpoint } from './simTypes';

export interface SerializableSimState {
  t: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  rotation: number;
  angularVelocity: number;
  activeParts: string[]; // Array instead of Set
  currentMass: number;
  currentFuel: number;
  currentThrust: number;
  throttle: number;
  currentStage: number;
  stages: string[][];
}

export function serializeSimState(state: SimState): SerializableSimState {
  return {
    ...state,
    activeParts: Array.from(state.activeParts),
  };
}

export function deserializeSimState(serialized: SerializableSimState): SimState {
  return {
    ...serialized,
    activeParts: new Set(serialized.activeParts),
  };
}

export function serializeCheckpoint(checkpoint: Checkpoint): { t: number; state: SerializableSimState } {
  return {
    t: checkpoint.t,
    state: serializeSimState(checkpoint.state),
  };
}

export function deserializeCheckpoint(checkpoint: { t: number; state: SerializableSimState }): Checkpoint {
  return {
    t: checkpoint.t,
    state: deserializeSimState(checkpoint.state),
  };
}
