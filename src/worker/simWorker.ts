// Web Worker entry point with Comlink RPC

import * as Comlink from 'comlink';
import { SimController } from './simController';
import { ReplayController } from './replayController';
import type { SimState, RocketDesign, SimParams, EventLogItem, TelemetrySample } from '../sim/simTypes';

// Expose controllers via Comlink
const simController = new SimController();
const replayController = new ReplayController();

// Callbacks from main thread
let telemetryCallback: ((sample: TelemetrySample) => void) | null = null;
let stoppedCallback: (() => void) | null = null;

function updateSimCallbacks() {
  simController.setCallbacks({
    onTelemetry: (sample) => telemetryCallback?.(sample),
    onStopped: () => stoppedCallback?.(),
  });
}
updateSimCallbacks();

const workerApi = {
  // Sim controller methods
  initializeSim: (design: RocketDesign, seed: number, params?: SimParams, initialState?: SimState) => {
    simController.initialize(design, seed, params, initialState);
  },
  
  startSim: () => {
    simController.start();
  },
  
  stopSim: () => {
    simController.stop();
  },
  
  addEvent: (event: EventLogItem) => {
    simController.addEvent(event);
  },
  
  getSimState: (): SimState | null => {
    return simController.getState();
  },
  
  getSimEvents: (): EventLogItem[] => {
    return simController.getEvents();
  },
  
  setTelemetryCallback: (callback: (sample: TelemetrySample) => void) => {
    telemetryCallback = callback;
    updateSimCallbacks();
  },
  setStoppedCallback: (callback: () => void) => {
    stoppedCallback = callback;
    updateSimCallbacks();
  },
  
  // Replay controller methods
  loadReplay: (bundle: any) => {
    replayController.loadReplay(bundle);
  },
  
  seekReplay: (t: number) => {
    replayController.seek(t);
  },
  
  playReplay: () => {
    replayController.play();
  },
  
  pauseReplay: () => {
    replayController.pause();
  },
  
  stopReplay: () => {
    replayController.stop();
  },
  
  setReplaySpeed: (speed: number) => {
    replayController.setSpeed(speed);
  },
  
  getReplayTime: (): number => {
    return replayController.getCurrentTime();
  },
  
  getReplayDuration: (): number => {
    return replayController.getDuration();
  },
  
  getReplayState: (): SimState | null => {
    return replayController.getState();
  },
  
  getTelemetryWindow: (tStart: number, tEnd: number): TelemetrySample[] => {
    return replayController.getTelemetryWindow(tStart, tEnd);
  },
};

Comlink.expose(workerApi);

export type WorkerApi = typeof workerApi;
