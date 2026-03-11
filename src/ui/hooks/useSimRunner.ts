// Hook: runs sim worker so Launch from Design can start sim immediately

import { useEffect, useRef, useCallback } from 'react';
import * as Comlink from 'comlink';
import type { WorkerApi } from '../../worker/simWorker';
import type { EventLogItem, TelemetrySample } from '../../sim/simTypes';
import { DEFAULT_SIM_PARAMS } from '../../sim/simTypes';
import { designToParts, getStageIds } from '../../sim/rocket';
import { createReplayBundle } from '../../sim/replay';
import { saveReplay } from '../../utils/db';
import { serializeSimState } from '../../sim/serialization';
import { useStore } from '../../state/store';

export function useSimRunner() {
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const eventsRef = useRef<EventLogItem[]>([]);
  const checkpointsRef = useRef<Array<{ t: number; state: any }>>([]);
  const lastCheckpointTimeRef = useRef(0);
  const lastPaidSimTimeRef = useRef(0);
  const checkpointInterval = 2.0;

  const {
    currentDesign,
    simStepSize,
    setSimRunning,
    addTelemetrySample,
    clearTelemetry,
    telemetry,
    addReplay,
    addMoney,
    cashPerSecond,
  } = useStore();

  useEffect(() => {
    const worker = new Worker(
      new URL('../../worker/simWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    apiRef.current = Comlink.wrap<WorkerApi>(worker);

    apiRef.current.setTelemetryCallback(
      Comlink.proxy((sample: TelemetrySample) => {
        addTelemetrySample(sample);
        const currentSimSec = Math.floor(sample.t);
        if (currentSimSec > lastPaidSimTimeRef.current) {
          const seconds = currentSimSec - lastPaidSimTimeRef.current;
          addMoney(seconds * cashPerSecond);
          lastPaidSimTimeRef.current = currentSimSec;
        }
        if (sample.t - lastCheckpointTimeRef.current >= checkpointInterval) {
          apiRef.current?.getSimState().then((state) => {
            if (state) {
              checkpointsRef.current.push({
                t: state.t,
                state: serializeSimState(state),
              });
              lastCheckpointTimeRef.current = sample.t;
            }
          });
        }
      })
    );
    apiRef.current.setStoppedCallback(
      Comlink.proxy(() => {
        setSimRunning(false);
        // Run mission payouts and save replay (same as manual stop)
        const state = useStore.getState();
        const { telemetry: t, currentDesign: d } = state;
        if (t.length > 0) {
          let totalPayout = 0;
          const maxAltitude = Math.max(...t.map((s) => s.altitude));
          totalPayout += Math.floor(maxAltitude / 100) * 1;
          const STRATOSPHERE_ALTITUDE_M = 15000;
          const stratosphereSample = t.find((s) => s.altitude >= STRATOSPHERE_ALTITUDE_M);
          if (stratosphereSample) totalPayout += Math.floor(stratosphereSample.mass) * 1;
          if (totalPayout > 0) state.addMoney(totalPayout);
        }
        if (d && eventsRef.current.length > 0) {
          apiRef.current?.getSimState().then(async (simState) => {
            if (simState) {
              const storeState = useStore.getState();
              const dt = storeState.simStepSize;
              const params = { ...DEFAULT_SIM_PARAMS, dt };
              const bundle = createReplayBundle(
                d,
                eventsRef.current,
                checkpointsRef.current,
                Math.floor(Math.random() * 1000000),
                dt,
                params,
                storeState.telemetry.slice(-1000)
              );
              await saveReplay(bundle);
              useStore.getState().addReplay(bundle);
            }
          });
        }
      })
    );

    return () => {
      apiRef.current?.stopSim();
      worker?.terminate();
    };
  }, [addTelemetrySample, addMoney, cashPerSecond, setSimRunning]);

  const startSim = useCallback(async () => {
    if (!currentDesign || !apiRef.current || !currentDesign.stages?.length) return;

    clearTelemetry();
    eventsRef.current = [];
    checkpointsRef.current = [];
    lastCheckpointTimeRef.current = 0;
    lastPaidSimTimeRef.current = 0;

    const simDesign = {
      ...currentDesign,
      parts: designToParts(currentDesign),
      _stageIds: getStageIds(currentDesign),
    };
    const seed = Math.floor(Math.random() * 1000000);
    const params = { ...DEFAULT_SIM_PARAMS, dt: simStepSize };
    await apiRef.current.initializeSim(simDesign, seed, params);

    const startEvent: EventLogItem = { t: 0, type: 'start', payload: {} };
    eventsRef.current.push(startEvent);
    await apiRef.current.addEvent(startEvent);

    const initialState = await apiRef.current.getSimState();
    if (initialState) {
      checkpointsRef.current.push({ t: 0, state: serializeSimState(initialState) });
    }

    await apiRef.current.startSim();
    setSimRunning(true);
  }, [currentDesign, simStepSize, clearTelemetry, setSimRunning]);

  const stopSim = useCallback(async () => {
    if (!apiRef.current) return;
    await apiRef.current.stopSim();
    setSimRunning(false);

    // Mission payouts
    if (telemetry.length > 0) {
      let totalPayout = 0;
      // Sounding: $1 per 100 m max altitude reached
      const maxAltitude = Math.max(...telemetry.map((s) => s.altitude));
      totalPayout += Math.floor(maxAltitude / 100) * 1;
      // Stratosphere test: $1 per kg delivered to stratosphere (first crossing of 15 km)
      const STRATOSPHERE_ALTITUDE_M = 15000;
      const stratosphereSample = telemetry.find((s) => s.altitude >= STRATOSPHERE_ALTITUDE_M);
      if (stratosphereSample) {
        totalPayout += Math.floor(stratosphereSample.mass) * 1; // $1 per kg
      }
      if (totalPayout > 0) addMoney(totalPayout);
    }

    if (currentDesign && eventsRef.current.length > 0) {
      const state = await apiRef.current.getSimState();
      if (state) {
        const params = { ...DEFAULT_SIM_PARAMS, dt: simStepSize };
        const bundle = createReplayBundle(
          currentDesign,
          eventsRef.current,
          checkpointsRef.current,
          Math.floor(Math.random() * 1000000),
          simStepSize,
          params,
          telemetry.slice(-1000)
        );
        await saveReplay(bundle);
        addReplay(bundle);
      }
    }
  }, [currentDesign, simStepSize, telemetry, setSimRunning, addReplay, addMoney]);

  return { startSim, stopSim };
}
