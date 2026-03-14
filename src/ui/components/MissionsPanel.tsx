// Achievements tab: Sounding achievement + past runs (replays)

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import * as Comlink from 'comlink';
import type { WorkerApi } from '../../worker/simWorker';
import { loadReplays, deleteReplay } from '../../utils/db';

const STRATOSPHERE_ALTITUDE_KM = 15;

const ACHIEVEMENTS = [
  {
    id: 'sounding',
    name: 'Sounding',
    description: 'Launch your rocket.',
    points: 5,
  },
  {
    id: 'stratosphere-test',
    name: 'Stratosphere test',
    description: `Deliver payload to the stratosphere (${STRATOSPHERE_ALTITUDE_KM} km).`,
    points: 5,
  },
];

export function MissionsPanel() {
  const {
    unlockedAchievements,
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

  const [hideUnlocked, setHideUnlocked] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const worker = new Worker(
      new URL('../../worker/simWorker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;
    apiRef.current = Comlink.wrap<WorkerApi>(worker);
    loadReplays().then((saved) => {
      saved.forEach((bundle) => addReplay(bundle));
    });
    return () => {
      apiRef.current?.pauseReplay();
      worker?.terminate();
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

  useEffect(() => {
    if (!replayPlaying || !apiRef.current) return;
    const interval = setInterval(async () => {
      const t = await apiRef.current?.getReplayTime();
      if (t !== undefined) setCurrentReplayTime(t);
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

  const handleSeek = (t: number) => {
    if (!apiRef.current) return;
    apiRef.current.seekReplay(t);
    setCurrentReplayTime(t);
  };

  const handleSpeedChange = async (speed: number) => {
    setReplaySpeed(speed);
    if (apiRef.current) await apiRef.current.setReplaySpeed(speed);
  };

  const handleDelete = async (id: string) => {
    await deleteReplay(id);
    removeReplay(id);
    if (selectedReplayIds.includes(id)) setSelectedReplayIds([]);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Achievements</h2>
        <button
          type="button"
          onClick={() => setHideUnlocked((v) => !v)}
          style={{
            padding: '0.25rem 0.6rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          {hideUnlocked ? 'Show unlocked' : 'Hide unlocked'}
        </button>
      </div>

      {ACHIEVEMENTS.filter((a) =>
        hideUnlocked ? !unlockedAchievements.includes(a.id) : true
      ).map((achievement) => {
        const unlocked = unlockedAchievements.includes(achievement.id);
        return (
          <div
            key={achievement.id}
            style={{
              marginBottom: '1rem',
              padding: '1rem',
              border: unlocked ? '1px solid #2e7d32' : '1px solid #aaa',
              borderRadius: '8px',
              backgroundColor: unlocked ? '#e8f5e9' : '#f0f0f0',
              opacity: unlocked ? 1 : 0.7,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.25rem',
              }}
            >
              <h3 style={{ margin: 0 }}>{achievement.name}</h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: unlocked ? '#2e7d32' : '#777',
                  textTransform: 'uppercase',
                }}
              >
                {unlocked ? 'Unlocked' : 'Locked'}
              </span>
            </div>
            <p
              style={{
                margin: '0.25rem 0 0.35rem',
                color: unlocked ? '#1b5e20' : '#555',
              }}
            >
              {achievement.description}
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
              Worth {achievement.points ?? 5} points. Launch from Design tab.
            </p>
          </div>
        );
      })}

      <div style={{ marginBottom: '1rem' }}>
        <h3>Past runs</h3>
        {replays.length === 0 ? (
          <p>No runs yet. Launch from Design to complete the Sounding achievement.</p>
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
                      {replay.rocketDesign.name} – {new Date(replay.metadata.createdAt).toLocaleString()}
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
