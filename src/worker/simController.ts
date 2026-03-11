// Simulation controller: runs fixed-timestep physics loop

import type { SimState, SimParams, RocketDesign, EventLogItem, TelemetrySample } from '../sim/simTypes';
import { DEFAULT_SIM_PARAMS } from '../sim/simTypes';
import { SeededPRNG } from '../sim/prng';
import { integratePhysics, getMechanicsDerivative } from '../sim/physics';
import { designToParts, getStageIds, updateRocketState, computeFuelConsumption, stageRocket, buildStages } from '../sim/rocket';
import { createTelemetrySample, getSimInstability } from '../sim/telemetry';
import { deserializeSimState } from '../sim/serialization';

/** Adaptive timestep bounds and initial value (seconds). */
const DT_MIN = 0.01;
const DT_MAX = 1;
const DT_INITIAL = 0.01;

export interface SimControllerCallbacks {
  onTelemetry?: (sample: TelemetrySample) => void;
  onStateChange?: (state: SimState) => void;
  onStopped?: () => void;
}

export class SimController {
  private state: SimState | null = null;
  private params: SimParams = DEFAULT_SIM_PARAMS;
  private design: RocketDesign | null = null;
  /** Reserved for future deterministic randomness (e.g. wind, dispersion) */
  private _prng: SeededPRNG | null = null;
  private events: EventLogItem[] = [];
  private running = false;
  private callbacks: SimControllerCallbacks = {};
  private telemetryInterval = 0.05; // 20 Hz
  private lastTelemetryTime = 0;
  private animationFrameId: number | null = null;
  /** Adaptive timestep (s); clamped to [DT_MIN, DT_MAX], starts at DT_INITIAL. */
  private currentDt = DT_INITIAL;

  initialize(
    design: RocketDesign,
    seed: number,
    params: SimParams = DEFAULT_SIM_PARAMS,
    initialState?: SimState | any
  ): void {
    let designToUse = design;
    if (design.stages?.length && !design.parts?.length) {
      designToUse = {
        ...design,
        parts: designToParts(design),
        _stageIds: getStageIds(design),
      };
    }
    this.design = designToUse;
    this.params = params;
    this._prng = new SeededPRNG(seed);
    this._prng.next(); // warm RNG for determinism

    if (initialState) {
      // Restore from checkpoint (handle both serialized and normal state)
      if (initialState.activeParts instanceof Set) {
        this.state = JSON.parse(JSON.stringify(initialState));
      } else {
        this.state = deserializeSimState(initialState);
      }
    } else {
      const parts = this.design.parts ?? [];
      const stages = buildStages(this.design);
      const activeParts = new Set(parts.map((p) => p.id));
      
      // Initial state (throttle 1 = full thrust at launch)
      this.state = {
        t: 0,
        position: { x: 0, y: 0 },
        velocity: { x: 0, y: 0 },
        rotation: 0,
        angularVelocity: 0,
        activeParts,
        currentMass: 0,
        currentFuel: 0,
        currentThrust: 0,
        throttle: 1,
        currentStage: 0,
        stages,
      };
      
      // Initialize rocket state
      this.state = updateRocketState(this.design, this.state, params);

      let totalFuel = 0;
      for (const part of parts) {
        if (part.type === 'tank' && part.fuelMass) {
          totalFuel += part.fuelMass;
        }
      }
      this.state.currentFuel = totalFuel;
      this.state = updateRocketState(this.design, this.state, params);
    }
    
    this.events = [];
    this.lastTelemetryTime = this.state?.t || 0;
    this.currentDt = DT_INITIAL;
  }

  setCallbacks(callbacks: SimControllerCallbacks): void {
    this.callbacks = callbacks;
  }

  start(): void {
    if (!this.state || !this.design) {
      throw new Error('Simulation not initialized');
    }
    this.running = true;
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.callbacks.onStopped?.();
  }

  private loop = (): void => {
    if (!this.running || !this.state || !this.design) {
      return;
    }
    
    // Process events up to current time
    this.processEvents();
    
    // Step physics
    this.step();

    // End sim when rocket reaches ground (altitude <= 0)
    if (this.state && this.state.position.y <= 0) {
      this.stop();
      return;
    }
    
    // Emit telemetry if needed
    if (this.state.t - this.lastTelemetryTime >= this.telemetryInterval) {
      const derivative = getMechanicsDerivative(this.state, this.params);
      const sample = createTelemetrySample(this.state, this.params, {
        dt: this.currentDt,
        derivative,
      });
      this.callbacks.onTelemetry?.(sample);
      this.lastTelemetryTime = this.state.t;
    }
    
    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /** Clone state for adaptive-step rollback. */
  private cloneState(s: SimState): SimState {
    return {
      ...s,
      position: { ...s.position },
      velocity: { ...s.velocity },
      activeParts: new Set(s.activeParts),
      stages: s.stages.map((g) => [...g]),
    };
  }

  /** Perform a single physics step with given dt (used for adaptive timestep). */
  private stepWithDt(dt: number): void {
    if (!this.state || !this.design) return;
    this.state = updateRocketState(this.design, this.state, this.params);
    this.state = integratePhysics(this.state, null, this.params, dt);
    if (this.state.currentThrust > 0) {
      const fuelConsumed = computeFuelConsumption(
        this.design,
        this.state.activeParts,
        this.state.throttle,
        dt
      );
      this.state.currentFuel = Math.max(0, this.state.currentFuel - fuelConsumed);
    }
    this.state.t += dt;
    this.state = updateRocketState(this.design, this.state, this.params);
  }

  /** True if any derivative/value ratio > 10% (need to redo step with smaller dt). */
  private anyDerivativeOver10Percent(state: SimState): boolean {
    const deriv = getMechanicsDerivative(state, this.params);
    const values = [
      state.position.x,
      state.position.y,
      state.velocity.x,
      state.velocity.y,
      state.rotation,
      state.angularVelocity,
    ];
    const eps = [1, 1, 0.1, 0.1, 0.01, 0.01];
    for (let i = 0; i < 6; i++) {
      const scale = Math.max(Math.abs(values[i]), eps[i]);
      if (scale > 0 && Math.abs(deriv[i]) / scale > 0.1) return true;
    }
    return false;
  }

  step(): void {
    if (!this.state || !this.design) return;

    const savedState = this.cloneState(this.state);
    const dt = this.currentDt;

    this.stepWithDt(dt);

    if (this.anyDerivativeOver10Percent(this.state!)) {
      this.state = savedState;
      this.currentDt = DT_MIN;
      this.stepWithDt(DT_MIN);
      // After redo, still consider doubling if state is now stable
      const derivRedo = getMechanicsDerivative(this.state!, this.params);
      const simInstabilityRedo = getSimInstability(this.state!, this.params, DT_MIN, derivRedo);
      if (simInstabilityRedo <= 0.01) {
        this.currentDt = Math.min(2 * this.currentDt, DT_MAX);
      }
    } else {
      const deriv = getMechanicsDerivative(this.state!, this.params);
      const simInstability = getSimInstability(this.state!, this.params, this.currentDt, deriv);
      // Double timestep when sim instability is at or below 1% (fraction 0.01)
      if (simInstability <= 0.01) {
        this.currentDt = Math.min(2 * this.currentDt, DT_MAX);
      }
    }
  }

  private processEvents(): void {
    if (!this.state) return;
    
    const dt = this.currentDt;
    // Process events that should occur at current time or before
    const eventsToProcess = this.events.filter(
      (e) => e.t <= this.state!.t && e.t > this.state!.t - dt
    );
    
    for (const event of eventsToProcess) {
      this.applyEvent(event);
    }
    
    // Remove processed events
    this.events = this.events.filter((e) => e.t > this.state!.t);
  }

  addEvent(event: EventLogItem): void {
    // Only add if not already processed
    if (!this.state || event.t >= this.state.t) {
      this.events.push(event);
      // Sort events by time
      this.events.sort((a, b) => a.t - b.t);
    }
  }

  private applyEvent(event: EventLogItem): void {
    if (!this.state || !this.design) return;
    
    switch (event.type) {
      case 'throttle':
        this.state.throttle = Math.max(0, Math.min(1, event.payload.value as number));
        break;
      case 'stage':
        this.state = stageRocket(this.state);
        this.state = updateRocketState(this.design, this.state, this.params);
        break;
      case 'start':
        // Already started
        break;
      case 'stop':
        this.running = false;
        break;
    }
  }

  getState(): SimState | null {
    return this.state;
  }

  getEvents(): EventLogItem[] {
    return [...this.events];
  }

  reset(): void {
    this.stop();
    this.state = null;
    this.events = [];
  }
}
