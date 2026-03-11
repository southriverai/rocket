// Replay controller: loads replay, seeks, plays back

import type {
  ReplayBundle,
  SimState,
  TelemetrySample,
} from '../sim/simTypes';
import { SimController } from './simController';
import { findNearestCheckpoint } from '../sim/replay';
import { DEFAULT_SIM_PARAMS } from '../sim/simTypes';
import { deserializeSimState } from '../sim/serialization';

export class ReplayController {
  private bundle: ReplayBundle | null = null;
  private controller: SimController;
  private currentTime = 0;
  private playing = false;
  private speed = 1.0;
  private animationFrameId: number | null = null;

  constructor() {
    this.controller = new SimController();
  }

  loadReplay(bundle: ReplayBundle): void {
    this.bundle = bundle;
    this.controller.reset();
    this.controller.initialize(
      bundle.rocketDesign,
      bundle.metadata.seed,
      bundle.metadata.simParams || DEFAULT_SIM_PARAMS
    );
    
    // Add all events
    for (const event of bundle.events) {
      this.controller.addEvent(event);
    }
    
    this.currentTime = 0;
  }

  seek(t: number): void {
    if (!this.bundle) return;
    
    this.stop();
    
    // Find nearest checkpoint <= t
    const checkpoint = findNearestCheckpoint(this.bundle.checkpoints, t);
    
    if (checkpoint) {
      // Restore state from checkpoint
      this.restoreState(checkpoint.state);
      this.currentTime = checkpoint.t;
      
      // Re-simulate forward to t
      this.resimulateTo(t);
    } else {
      // No checkpoint, start from beginning
      this.controller.reset();
      this.controller.initialize(
        this.bundle.rocketDesign,
        this.bundle.metadata.seed,
        this.bundle.metadata.simParams || DEFAULT_SIM_PARAMS
      );
      for (const event of this.bundle.events) {
        this.controller.addEvent(event);
      }
      this.resimulateTo(t);
      this.currentTime = t;
    }
  }

  private restoreState(checkpointState: any): void {
    // Reinitialize controller and restore state
    if (!this.bundle) return;
    
    // Deserialize state if needed
    const state = deserializeSimState(checkpointState);
    
    this.controller.reset();
    this.controller.initialize(
      this.bundle.rocketDesign,
      this.bundle.metadata.seed,
      this.bundle.metadata.simParams || DEFAULT_SIM_PARAMS,
      state
    );
    
    // Re-add events that occur after checkpoint time
    for (const event of this.bundle.events) {
      if (event.t > state.t) {
        this.controller.addEvent(event);
      }
    }
  }

  private resimulateTo(targetTime: number): void {
    if (!this.bundle) return;
    
    const state = this.controller.getState();
    if (!state) return;
    
    const dt = this.bundle.metadata.dt;
    const maxSteps = Math.ceil((targetTime - state.t) / dt) + 10000; // Safety limit
    let steps = 0;
    
    while (state.t < targetTime && steps < maxSteps) {
      // Step simulation (events are processed inside step)
      this.controller.step();
      steps++;
    }
  }

  play(): void {
    if (!this.bundle) return;
    
    this.playing = true;
    this.loop();
  }

  pause(): void {
    this.playing = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  stop(): void {
    this.pause();
    this.currentTime = 0;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  private loop = (): void => {
    if (!this.playing || !this.bundle) return;
    
    const state = this.controller.getState();
    if (!state) {
      this.pause();
      return;
    }
    
    // Step forward
    const dt = this.bundle.metadata.dt * this.speed;
    this.seek(state.t + dt);
    this.currentTime = state.t;
    
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  getTelemetryWindow(tStart: number, tEnd: number): TelemetrySample[] {
    if (!this.bundle) return [];
    
    // If we have cached telemetry, use it
    if (this.bundle.cachedDownsampledTelemetry) {
      return this.bundle.cachedDownsampledTelemetry.filter(
        s => s.t >= tStart && s.t <= tEnd
      );
    }
    
    // Otherwise, generate on-demand
    // This is expensive, so we'd want to cache results
    return [];
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    if (!this.bundle) return 0;
    const lastCheckpoint = this.bundle.checkpoints[this.bundle.checkpoints.length - 1];
    return lastCheckpoint ? lastCheckpoint.t : 0;
  }

  getState(): SimState | null {
    return this.controller.getState();
  }
}
