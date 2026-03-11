// Simulation controls

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import * as Comlink from 'comlink';
import type { WorkerApi } from '../../worker/simWorker';
import type { EventLogItem, TelemetrySample } from '../../sim/simTypes';
import { designToParts, getStageIds } from '../../sim/rocket';
import { createReplayBundle } from '../../sim/replay';
import { saveReplay } from '../../utils/db';
import { serializeSimState } from '../../sim/serialization';

export function SimControls() {
  const {
    currentDesign,
    simRunning,
    setSimRunning,
    setSimState,
    addTelemetrySample,
    clearTelemetry,
    telemetry,
    addReplay,
    addMoney,
    cashPerSecond,
  } = useStore();

  const [throttle, setThrottle] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const eventsRef = useRef<EventLogItem[]>([]);
  const checkpointsRef = useRef<Array<{ t: number; state: any }>>([]);
  const lastCheckpointTimeRef = useRef(0);
  const lastPaidSimTimeRef = useRef(0);
  const checkpointInterval = 2.0; // 2 seconds

  useEffect(() => {
    // Initialize worker
    const worker = new Worker(
      new URL('../../worker/simWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    apiRef.current = Comlink.wrap<WorkerApi>(worker);

    // Set up telemetry callback
    apiRef.current.setTelemetryCallback(
      Comlink.proxy((sample: TelemetrySample) => {
        addTelemetrySample(sample);

        const currentSimSec = Math.floor(sample.t);
        if (currentSimSec > lastPaidSimTimeRef.current) {
          const seconds = currentSimSec - lastPaidSimTimeRef.current;
          addMoney(seconds * cashPerSecond);
          lastPaidSimTimeRef.current = currentSimSec;
        }

        // Create checkpoint periodically
        if (sample.t - lastCheckpointTimeRef.current >= checkpointInterval) {
          apiRef.current?.getSimState().then((state) => {
            if (state) {
              const serializedState = serializeSimState(state);
              checkpointsRef.current.push({
                t: state.t,
                state: serializedState,
              });
              lastCheckpointTimeRef.current = sample.t;
            }
          });
        }
      })
    );

    return () => {
      if (apiRef.current) {
        apiRef.current.stopSim();
      }
      workerRef.current?.terminate();
    };
  }, [addTelemetrySample, addMoney, cashPerSecond]);

  const startSim = async () => {
    if (!currentDesign || !apiRef.current) return;
    if (!currentDesign.stages?.length) return;

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
    await apiRef.current.initializeSim(simDesign, seed);
    
    // Add start event
    const startEvent: EventLogItem = {
      t: 0,
      type: 'start',
      payload: {},
    };
    eventsRef.current.push(startEvent);
    await apiRef.current.addEvent(startEvent);

    // Initial checkpoint
    const initialState = await apiRef.current.getSimState();
    if (initialState) {
      checkpointsRef.current.push({
        t: 0,
        state: serializeSimState(initialState),
      });
    }

    await apiRef.current.startSim();
    setSimRunning(true);
  };

  const stopSim = async () => {
    if (!apiRef.current) return;
    
    await apiRef.current.stopSim();
    setSimRunning(false);

    // Save replay
    if (currentDesign && eventsRef.current.length > 0) {
      const state = await apiRef.current.getSimState();
      if (state) {
        const bundle = createReplayBundle(
          currentDesign,
          eventsRef.current,
          checkpointsRef.current,
          Math.floor(Math.random() * 1000000), // In real app, track seed
          0.01,
          { dt: 0.01, gravity: 9.81, seaLevelDensity: 1.225, scaleHeight: 8400, dragCoeff: 0.5 },
          telemetry.slice(-1000) // Cache last 1000 samples
        );
        await saveReplay(bundle);
        addReplay(bundle);
      }
    }
  };

  const handleThrottle = async (value: number) => {
    setThrottle(value);
    if (!apiRef.current || !simRunning) return;

    const state = await apiRef.current.getSimState();
    if (!state) return;

    const event: EventLogItem = {
      t: state.t,
      type: 'throttle',
      payload: { value },
    };
    eventsRef.current.push(event);
    await apiRef.current.addEvent(event);
  };

  const handleStage = async () => {
    if (!apiRef.current || !simRunning) return;

    const state = await apiRef.current.getSimState();
    if (!state) return;

    const event: EventLogItem = {
      t: state.t,
      type: 'stage',
      payload: {},
    };
    eventsRef.current.push(event);
    await apiRef.current.addEvent(event);
  };

  // Poll for state updates
  useEffect(() => {
    if (!simRunning || !apiRef.current) return;

    const interval = setInterval(async () => {
      const state = await apiRef.current?.getSimState();
      if (state) {
        setSimState(state);
      }
    }, 50); // 20 Hz

    return () => clearInterval(interval);
  }, [simRunning, setSimState]);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Simulation Controls</h2>
      
      {!currentDesign ? (
        <p>Please design a rocket first.</p>
      ) : !currentDesign.stages?.length ? (
        <p>Add at least one stage in Design.</p>
      ) : (
        <>
          <div style={{ marginBottom: '1rem' }}>
            {!simRunning ? (
              <button onClick={startSim} style={{ padding: '0.5rem 1rem' }}>
                Start Simulation
              </button>
            ) : (
              <button onClick={stopSim} style={{ padding: '0.5rem 1rem' }}>
                Stop Simulation
              </button>
            )}
          </div>

          {simRunning && (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label>
                  Throttle: {Math.round(throttle * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={throttle}
                    onChange={(e) => handleThrottle(parseFloat(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </label>
              </div>

              <div>
                <button onClick={handleStage} style={{ padding: '0.5rem 1rem' }}>
                  Stage
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
