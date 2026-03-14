// Main App component

import { useStore } from '../state/store';
import { useSimRunner } from './hooks/useSimRunner';
import { Layout } from './components/Layout';
import { RocketEditor } from './components/RocketEditor';
import { MissionsPanel } from './components/MissionsPanel';
import { ChartsPanel } from './components/ChartsPanel';
import { UpgradesPanel } from './components/UpgradesPanel';
import { AchievementToasts } from './components/AchievementToasts';

const tabStyle = (active: boolean) => ({
  padding: '0.5rem 1rem',
  backgroundColor: active ? '#007bff' : '#f0f0f0',
  color: active ? '#fff' : '#000',
  border: '1px solid #ccc',
  cursor: 'pointer' as const,
});

export function App() {
  const { mode, setMode, money, cashPerSecond, simStepSize, setSimStepSize } = useStore();
  const { startSim, stopSim } = useSimRunner();

  const renderLeftPanel = () => {
    switch (mode) {
      case 'design':
        return <RocketEditor onLaunch={startSim} onStop={stopSim} />;
      case 'upgrades':
        return <UpgradesPanel />;
      default:
        return null;
    }
  };

  const renderRightPanel = () => (mode === 'upgrades' ? null : <ChartsPanel />);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          borderBottom: '2px solid #ccc',
          backgroundColor: '#fff',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '1.1rem', minWidth: '6rem' }}>
          Points: {money.toLocaleString()}
        </div>
        <div style={{ fontSize: '0.9rem', color: '#666' }}>
          Points/s: {cashPerSecond}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
          Step (s):
          <input
            type="number"
            min={0.01}
            max={10}
            step={0.01}
            value={simStepSize}
            onChange={(e) => setSimStepSize(parseFloat(e.target.value) || 1)}
            style={{ width: 56, padding: '0.2rem 0.35rem' }}
          />
        </label>
        <button onClick={() => setMode('design')} style={tabStyle(mode === 'design')}>
          Design
        </button>
        <button onClick={() => setMode('achievements')} style={tabStyle(mode === 'achievements')}>
          Achievements
        </button>
        <button onClick={() => setMode('upgrades')} style={tabStyle(mode === 'upgrades')}>
          Upgrades
        </button>
      </div>
      {mode === 'achievements' ? (
        <MissionsPanel />
      ) : (
        <Layout left={renderLeftPanel()} right={renderRightPanel()} />
      )}
      <AchievementToasts />
    </div>
  );
}
