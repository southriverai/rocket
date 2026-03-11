// Replay controls

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import * as Comlink from 'comlink';
import type { WorkerApi } from '../../worker/simWorker';
import { loadReplays, deleteReplay } from '../../utils/db';

export function ReplayControls() {
  const {
    replays,
    selectedReplayIds,
    currentReplayTime,
    replayPlaying,
    replaySpeed,
    setSelectedReplayIds,
    setCurrentReplayTime,
    setReplayPlaying,
    setReplaySpeed,
    addReplay,
    removeReplay,
  } = useStore();

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    // Initialize worker
    const worker = new Worker(
      new URL('../../worker/simWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    apiRef.current = Comlink.wrap<WorkerApi>(worker);

    // Load saved replays
    loadReplays().then((saved) => {
      saved.forEach((bundle) => addReplay(bundle));
    });

    return () => {
      if (apiRef.current) {
        apiRef.current.pauseReplay();
      }
      workerRef.current?.terminate();
    };
  }, [addReplay]);

  useEffect(() => {
    if (selectedReplayIds.length === 0 || !apiRef.current) {
      setDuration(0);
      return;
    }

    const selectedReplay = replays.find(
      (r) => r.metadata.createdAt.toString() === selectedReplayIds[0]
    );
    if (selectedReplay && apiRef.current) {
      apiRef.current.loadReplay(selectedReplay);
      apiRef.current.getReplayDuration().then((dur) => {
        setDuration(dur);
        setCurrentReplayTime(0);
      });
    }
  }, [selectedReplayIds, replays, setCurrentReplayTime]);

  // Poll for replay time updates
  useEffect(() => {
    if (!replayPlaying || !apiRef.current) return;

    const interval = setInterval(async () => {
      const t = await apiRef.current?.getReplayTime();
      if (t !== undefined) {
        setCurrentReplayTime(t);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [replayPlaying, setCurrentReplayTime]);

  const handlePlay = async () => {
    if (!apiRef.current) return;
    await apiRef.current.playReplay();
    setReplayPlaying(true);
  };

  const handlePause = async () => {
    if (!apiRef.current) return;
    await apiRef.current.pauseReplay();
    setReplayPlaying(false);
  };

  const handleSeek = async (t: number) => {
    if (!apiRef.current) return;
    await apiRef.current.seekReplay(t);
    setCurrentReplayTime(t);
  };

  const handleSpeedChange = async (speed: number) => {
    setReplaySpeed(speed);
    if (apiRef.current) {
      await apiRef.current.setReplaySpeed(speed);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteReplay(id);
    removeReplay(id);
    if (selectedReplayIds.includes(id)) {
      setSelectedReplayIds([]);
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Replay Controls</h2>

      <div style={{ marginBottom: '1rem' }}>
        <h3>Saved Replays</h3>
        {replays.length === 0 ? (
          <p>No replays yet. Run a simulation to create one.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {replays.map((replay) => {
              const id = replay.metadata.createdAt.toString();
              const isSelected = selectedReplayIds.includes(id);
              return (
                <div
                  key={id}
                  style={{
                    padding: '0.5rem',
                    border: isSelected ? '2px solid blue' : '1px solid #ccc',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedReplayIds([...selectedReplayIds, id]);
                        } else {
                          setSelectedReplayIds(selectedReplayIds.filter((rid) => rid !== id));
                        }
                      }}
                    />
                    <span style={{ marginLeft: '0.5rem' }}>
                      {replay.rocketDesign.name} -{' '}
                      {new Date(replay.metadata.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <button onClick={() => handleDelete(id)}>Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedReplayIds.length > 0 && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button onClick={replayPlaying ? handlePause : handlePlay}>
                {replayPlaying ? 'Pause' : 'Play'}
              </button>
              <span>
                {currentReplayTime.toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentReplayTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label>
              Speed: {replaySpeed.toFixed(1)}x
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={replaySpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
