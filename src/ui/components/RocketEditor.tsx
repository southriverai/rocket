// Rocket design editor: add stages (each stage = fuel + engine)

import { useState, useEffect } from 'react';
import type { RocketDesign, Stage, Material, SolidFuelType, StageType, EngineType, AerodynamicsType } from '../../sim/simTypes';
import { AERODYNAMICS_OPTIONS, AERODYNAMICS_COEFF } from '../../sim/simTypes';
import { MATERIAL_LABELS, getTankDryMass } from '../../sim/materials';
import { SOLID_FUEL_PROPS, SOLID_FUEL_TYPES, fuelMassToVolumeL } from '../../sim/solidFuels';
import { radiusFromVolumeAndElongation, crossSectionAreaFromRadius } from '../../sim/tankGeometry';
import { ENGINE_PROPS, ENGINE_TYPES } from '../../sim/engines';
import { getMaxStages, getMaxDesignSlots, getUnlockedStageTypes, STAGE_TYPE_LABELS } from './UpgradesPanel';
import { useStore } from '../../state/store';
import { computeStageStats, type StageStats } from '../../sim/rocket';

const TANK_MATERIALS: Material[] = ['steel', 'paper', 'plastic', 'carbon'];

const stageGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '180px 1fr',
  gap: '0.5rem',
  alignItems: 'center',
};
const stageFieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box' };

export function RocketEditor({
  onLaunch,
  onStop,
}: {
  onLaunch: () => void;
  onStop: () => void;
}) {
  const {
    currentDesign,
    setCurrentDesign,
    setDesignInCurrentSlot,
    designSlots,
    currentSlotIndex,
    openDesignSlot,
    backToDesignSlots,
    ensureDesignSlotsCount,
    unlockedUpgrades,
    simRunning,
  } = useStore();
  const maxStages = getMaxStages(unlockedUpgrades);
  const maxDesignSlots = getMaxDesignSlots(unlockedUpgrades);
  const unlockedStageTypes = getUnlockedStageTypes(unlockedUpgrades);

  useEffect(() => {
    ensureDesignSlotsCount(maxDesignSlots);
  }, [maxDesignSlots, ensureDesignSlotsCount]);

  // When opening an empty slot, create a design immediately
  useEffect(() => {
    if (currentSlotIndex === null || currentDesign !== null) return;
    const design: RocketDesign = {
      id: Date.now().toString(),
      name: `Design ${(currentSlotIndex ?? 0) + 1}`,
      stages: [],
      createdAt: Date.now(),
    };
    setDesignInCurrentSlot(design);
  }, [currentSlotIndex, currentDesign, setDesignInCurrentSlot]);

  const addStage = () => {
    if (!currentDesign || currentDesign.stages.length >= maxStages) return;
    const stage: Stage = {
      id: `stage-${Date.now()}`,
      stageType: 'solid',
      solidFuelType: 'black-powder',
      engineType: 'basic-exhaust',
      fuelMass: 50,
      material: 'steel',
      elongation: 1,
      frictionCoeff: 0.5,
      aerodynamics: 'cone',
    };
    setCurrentDesign({
      ...currentDesign,
      stages: [...currentDesign.stages, stage],
    });
  };

  const removeStage = (stageId: string) => {
    if (!currentDesign) return;
    setCurrentDesign({
      ...currentDesign,
      stages: currentDesign.stages.filter((s) => s.id !== stageId),
    });
  };

  const updateStage = (stageId: string, updates: Partial<Stage>) => {
    if (!currentDesign) return;
    setCurrentDesign({
      ...currentDesign,
      stages: currentDesign.stages.map((s) =>
        s.id === stageId ? { ...s, ...updates } : s
      ),
    });
  };

  // Slot list view
  if (currentSlotIndex === null) {
    return (
      <div style={{ padding: '1rem' }}>
        <h2>Rocket Designer</h2>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
          Choose a design slot ({maxDesignSlots} slot{maxDesignSlots !== 1 ? 's' : ''}). Unlock more in Upgrades.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Array.from({ length: maxDesignSlots }, (_, i) => {
            const design = designSlots[i] ?? null;
            return (
              <button
                key={i}
                onClick={() => openDesignSlot(i)}
                style={{
                  padding: '1rem',
                  textAlign: 'left',
                  border: '1px solid #ccc',
                  borderRadius: '8px',
                  backgroundColor: '#f9f9f9',
                  cursor: 'pointer',
                }}
              >
                <strong>Slot {i + 1}</strong>: {design ? design.name : 'Empty'}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Empty slot: design is created by useEffect above; show nothing until it's set
  if (!currentDesign) {
    return (
      <div style={{ padding: '1rem' }}>
        <h2>Rocket Designer</h2>
        <p>Loading...</p>
      </div>
    );
  }

  // Editing a design
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Rocket Designer</h2>

      <>
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={currentDesign.name}
              onChange={(e) => setCurrentDesign({ ...currentDesign, name: e.target.value.trim() || currentDesign.name })}
              style={{ fontSize: '1.25rem', fontWeight: 600, padding: '0.35rem 0.5rem', flex: '1 1 200px' }}
            />
            <button onClick={backToDesignSlots}>Back</button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4>Stages</h4>
            <button
              onClick={addStage}
              disabled={currentDesign.stages.length >= maxStages}
              style={{ opacity: currentDesign.stages.length >= maxStages ? 0.6 : 1, cursor: currentDesign.stages.length >= maxStages ? 'not-allowed' : 'pointer' }}
            >
              + Add stage
            </button>
            {currentDesign.stages.length >= maxStages && maxStages < 3 && (
              <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
                Unlock 2nd or 3rd stage in the Upgrades tab.
              </p>
            )}
          </div>

          <div>
            {currentDesign.stages.length === 0 ? (
              <p>No stages yet. Add a stage to build your rocket.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(() => {
                  const stageStats = computeStageStats(currentDesign);
                  return currentDesign.stages.map((stage, idx) => (
                    <StageEditor
                      key={stage.id}
                      stage={stage}
                      index={idx}
                      stats={stageStats[idx]}
                      unlockedStageTypes={unlockedStageTypes}
                      onUpdate={(updates) => updateStage(stage.id, updates)}
                      onRemove={() => removeStage(stage.id)}
                    />
                  ));
                })()}
              </div>
            )}
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
            {!simRunning ? (
              (() => {
                const stageStats = computeStageStats(currentDesign);
                const firstStageAccel = stageStats[0]?.accelerationAtTakeoff ?? 0;
                const cannotLaunch = currentDesign.stages.length === 0 || firstStageAccel <= 0;
                return (
                  <button
                    onClick={onLaunch}
                    disabled={cannotLaunch}
                    style={{
                      padding: '0.6rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: 600,
                      cursor: cannotLaunch ? 'not-allowed' : 'pointer',
                      opacity: cannotLaunch ? 0.6 : 1,
                    }}
                  >
                    Launch
                  </button>
                );
              })()
            ) : (
              <button
                onClick={onStop}
                style={{ padding: '0.6rem 1.5rem', fontSize: '1rem', fontWeight: 600 }}
              >
                Stop
              </button>
            )}
          </div>
      </>
    </div>
  );
}

function StageEditor({
  stage,
  index,
  stats,
  unlockedStageTypes,
  onUpdate,
  onRemove,
}: {
  stage: Stage;
  index: number;
  stats?: StageStats;
  unlockedStageTypes: StageType[];
  onUpdate: (updates: Partial<Stage>) => void;
  onRemove: () => void;
}) {
  const currentType = stage.stageType ?? 'solid';
  const displayType = unlockedStageTypes.includes(currentType) ? currentType : 'solid';

  const [fuelMassStr, setFuelMassStr] = useState(() => String(stage.fuelMass));
  useEffect(() => {
    setFuelMassStr(String(stage.fuelMass));
  }, [stage.fuelMass, stage.id]);

  const handleFuelMassBlur = () => {
    const n = parseFloat(fuelMassStr);
    const v = Number.isNaN(n) || n < 0 ? 0 : n;
    onUpdate({ fuelMass: v });
    setFuelMassStr(String(v));
  };

  return (
    <div
      style={{
        border: '1px solid #ccc',
        padding: '1rem',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <strong>Stage {index + 1}</strong>
        <button onClick={onRemove} style={{ padding: '0.25rem 0.5rem' }}>
          Remove
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Structural</div>
        <div style={stageGridStyle}>
          <label>Structural material:</label>
          <select
            style={stageFieldStyle}
            value={stage.material ?? 'steel'}
            onChange={(e) => onUpdate({ material: e.target.value as Material })}
          >
            {TANK_MATERIALS.map((m) => (
              <option key={m} value={m}>{MATERIAL_LABELS[m]}</option>
            ))}
          </select>
          <label>Elongation:</label>
          <input
            style={stageFieldStyle}
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={stage.elongation ?? 1}
            onChange={(e) => onUpdate({ elongation: Math.max(1, Math.min(5, parseFloat(e.target.value) || 1)) })}
          />
          <label>Radius:</label>
          <span>
            {radiusFromVolumeAndElongation(
              fuelMassToVolumeL(stage.fuelMass, stage.solidFuelType ?? 'black-powder'),
              stage.elongation ?? 1
            ).toFixed(3)}{' '}
            m
          </span>
          <label title="Frontal cross-section of the rocket (πR²); used e.g. for drag.">Cross-section area:</label>
          <span
            title="Frontal cross-section of the rocket (πR²); the circular area when viewed from the front."
          >
            {crossSectionAreaFromRadius(
              radiusFromVolumeAndElongation(
                fuelMassToVolumeL(stage.fuelMass, stage.solidFuelType ?? 'black-powder'),
                stage.elongation ?? 1
              )
            ).toFixed(2)}{' '}
            m²
          </span>
          <label title="Nose shape; sets the drag coefficient for this stage.">Aerodynamics:</label>
          <select
            style={stageFieldStyle}
            value={stage.aerodynamics ?? 'cone'}
            onChange={(e) => {
              const value = e.target.value as AerodynamicsType;
              onUpdate({ aerodynamics: value, frictionCoeff: AERODYNAMICS_COEFF[value] });
            }}
          >
            {AERODYNAMICS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <label title="Drag coefficient (set by aerodynamics selection).">Drag coefficient:</label>
          <span style={stageFieldStyle}>
            {(stage.frictionCoeff ?? AERODYNAMICS_COEFF[stage.aerodynamics ?? 'cone']).toFixed(2)}
          </span>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0.75rem 0' }} />

        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Fuel</div>
        <div style={stageGridStyle}>
          <label>Type:</label>
          <select
            style={stageFieldStyle}
            value={displayType}
            onChange={(e) => onUpdate({ stageType: e.target.value as StageType })}
          >
            {unlockedStageTypes.map((t) => (
              <option key={t} value={t}>{STAGE_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {currentType === 'solid' && (
            <>
              <label>Solid fuel:</label>
              <select
                style={stageFieldStyle}
                value={stage.solidFuelType ?? 'black-powder'}
                onChange={(e) => onUpdate({ solidFuelType: e.target.value as SolidFuelType })}
              >
                {SOLID_FUEL_TYPES.map((t) => (
                  <option key={t} value={t}>{SOLID_FUEL_PROPS[t].label}</option>
                ))}
              </select>
            </>
          )}
          <label>Fuel mass (kg):</label>
          <input
            style={stageFieldStyle}
            type="number"
            value={fuelMassStr}
            onChange={(e) => setFuelMassStr(e.target.value)}
            onBlur={handleFuelMassBlur}
            step="10"
            min="0"
          />
          {(stage.material != null) && (
            <>
              <label>Tank structure mass (kg):</label>
              <span>{getTankDryMass(stage.fuelMass, stage.material).toFixed(1)}</span>
            </>
          )}
          {currentType === 'solid' && (
            <>
              <label>Energy density:</label>
              <span>{(SOLID_FUEL_PROPS[stage.solidFuelType ?? 'black-powder'].energyDensityJkg / 1e6).toFixed(2)} MJ/kg</span>
              <label>Density:</label>
              <span>{SOLID_FUEL_PROPS[stage.solidFuelType ?? 'black-powder'].densityKgL.toFixed(2)} kg/L</span>
              <label>Tank volume:</label>
              <span>{fuelMassToVolumeL(stage.fuelMass, stage.solidFuelType ?? 'black-powder').toFixed(1)} L</span>
            </>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0.75rem 0' }} />

        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Engine</div>
        <div style={stageGridStyle}>
          <label>Engine:</label>
          <select
            style={stageFieldStyle}
            value={stage.engineType ?? 'basic-exhaust'}
            onChange={(e) => onUpdate({ engineType: e.target.value as EngineType })}
          >
            {ENGINE_TYPES.map((t) => (
              <option key={t} value={t}>{ENGINE_PROPS[t].label}</option>
            ))}
          </select>
          <label>Engine mass:</label>
          <span>{ENGINE_PROPS[stage.engineType ?? 'basic-exhaust'].massKg} kg</span>
          <label>Burn rate:</label>
          <span>{ENGINE_PROPS[stage.engineType ?? 'basic-exhaust'].burnRateLs} L/s</span>
          <label>Efficiency:</label>
          <span>{(ENGINE_PROPS[stage.engineType ?? 'basic-exhaust'].efficiency * 100).toFixed(0)}%</span>
        </div>

        {stats != null && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0.75rem 0' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Summary</div>
            <div style={stageGridStyle}>
              <label>Dry mass:</label>
              <span>{stats.dryMass.toFixed(1)} kg</span>
              <label>Wet mass:</label>
              <span>{stats.wetMass.toFixed(1)} kg</span>
              <label>Burn duration:</label>
              <span>{stats.burnDuration.toFixed(1)} s</span>
              <label>Exhaust velocity:</label>
              <span>{stats.exhaustVelocity.toFixed(0)} m/s</span>
              <label>Thrust:</label>
              <span>{stats.thrust.toFixed(0)} N</span>
              <label>Acceleration at takeoff:</label>
              <span>{stats.accelerationAtTakeoff.toFixed(1)} m/s²</span>
              <label>Delta-v:</label>
              <span>{stats.deltaV.toFixed(0)} m/s</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
