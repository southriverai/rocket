// Upgrades tab: unlock upgrades for money

import { useStore } from '../../state/store';
import type { StageType } from '../../sim/simTypes';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'design-slot-2', name: 'Design slot 2', description: 'Unlock a second design slot.', cost: 150 },
  { id: 'design-slot-3', name: 'Design slot 3', description: 'Unlock a third design slot.', cost: 350 },
  { id: 'liquid-fuel', name: 'Liquid fuel', description: 'Unlock liquid fuel stage type.', cost: 250 },
  { id: 'electromagnetic', name: 'Electromagnetic', description: 'Unlock electromagnetic stage type.', cost: 600 },
  { id: 'nuclear', name: 'Nuclear', description: 'Unlock nuclear stage type.', cost: 1000 },
  { id: 'second-stage', name: 'Second stage', description: 'Unlock a second stage (two-stage rocket).', cost: 200 },
  { id: 'third-stage', name: 'Third stage', description: 'Unlock a third stage (three-stage rocket).', cost: 500 },
  { id: 'carbon-tanks', name: 'Carbon casing', description: 'Unlock carbon casing material (lighter dry mass).', cost: 500 },
  { id: 'high-isp', name: 'High-ISP engine', description: 'Unlock improved engine efficiency (ISP +50).', cost: 800 },
  { id: 'throttle', name: 'Throttle control', description: 'Fine throttle control on all engines.', cost: 300 },
  { id: 'replay-save', name: 'Replay archive', description: 'Save up to 10 replays to compare runs.', cost: 400 },
  { id: 'telemetry-pro', name: 'Pro telemetry', description: 'Unlock acceleration and friction charts.', cost: 250 },
];

export const MAX_STAGES_BASE = 1;
export function getMaxStages(unlockedUpgrades: string[]): number {
  let max = MAX_STAGES_BASE;
  if (unlockedUpgrades.includes('second-stage')) max++;
  if (unlockedUpgrades.includes('third-stage')) max++;
  return max;
}

export const MAX_DESIGN_SLOTS_BASE = 1;
export function getMaxDesignSlots(unlockedUpgrades: string[]): number {
  let max = MAX_DESIGN_SLOTS_BASE;
  if (unlockedUpgrades.includes('design-slot-2')) max++;
  if (unlockedUpgrades.includes('design-slot-3')) max++;
  return max;
}

export function getUnlockedStageTypes(unlockedUpgrades: string[]): StageType[] {
  const types: StageType[] = ['solid'];
  if (unlockedUpgrades.includes('liquid-fuel')) types.push('liquid');
  if (unlockedUpgrades.includes('electromagnetic')) types.push('electromagnetic');
  if (unlockedUpgrades.includes('nuclear')) types.push('nuclear');
  return types;
}
export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  solid: 'Solid fuel',
  liquid: 'Liquid fuel',
  electromagnetic: 'Electromagnetic',
  nuclear: 'Nuclear',
};

export function UpgradesPanel() {
  const { money, unlockedUpgrades, purchaseUpgrade } = useStore();

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Upgrades</h2>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Spend money to unlock new capabilities. Earn money by running simulations (Cash/s while flying).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {UPGRADES.map((upgrade) => {
          const unlocked = unlockedUpgrades.includes(upgrade.id);
          const canAfford = money >= upgrade.cost;
          return (
            <div
              key={upgrade.id}
              style={{
                border: '1px solid #ccc',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: unlocked ? '#e8f5e9' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <strong style={{ fontSize: '1.05rem' }}>{upgrade.name}</strong>
                  {unlocked && (
                    <span style={{ marginLeft: '0.5rem', color: '#2e7d32', fontSize: '0.9rem' }}>✓ Unlocked</span>
                  )}
                </div>
                {!unlocked && (
                  <span style={{ color: '#666' }}>${upgrade.cost}</span>
                )}
              </div>
              <p style={{ margin: '0.5rem 0 0', color: '#555', fontSize: '0.95rem' }}>
                {upgrade.description}
              </p>
              {!unlocked && (
                <button
                  onClick={() => purchaseUpgrade(upgrade.id, upgrade.cost)}
                  disabled={!canAfford}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.4rem 0.8rem',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    opacity: canAfford ? 1 : 0.6,
                  }}
                >
                  {canAfford ? `Unlock ($${upgrade.cost})` : `Need $${upgrade.cost - money} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
