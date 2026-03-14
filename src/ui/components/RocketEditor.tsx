// Rocket design editor: add stages (each stage = fuel + engine)

import { useState, useEffect } from 'react';
import type { RocketDesign, Stage, Material, SolidFuelType, StageType, EngineType, AerodynamicsType } from '../../sim/simTypes';
import { AERODYNAMICS_OPTIONS, AERODYNAMICS_COEFF } from '../../sim/simTypes';
import { MATERIAL_LABELS, getTankDryMass, STRUCTURAL_LOAD_LIMIT_N_PER_KG } from '../../sim/materials';
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
    telemetry,
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
      overEngineeringFactor: 1,
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
              onChange={(e) =>
                setCurrentDesign({
                  ...currentDesign,
                  name: e.target.value.trim() || currentDesign.name,
                })
              }
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                padding: '0.35rem 0.5rem',
                flex: '1 1 200px',
              }}
            />
            <button onClick={backToDesignSlots}>Back</button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4>Structure</h4>
            <div style={stageGridStyle}>
              {/* Base dry mass without over-engineering */}
              <label>Dry mass (base):</label>
              <span>
                {(() => {
                  const factor = currentDesign.overEngineeringFactor ?? 1;
                  const totalDry = computeStageStats(currentDesign).reduce(
                    (sum, s) => sum + s.dryMass,
                    0
                  );
                  const base = factor > 0 ? totalDry / factor : totalDry;
                  return base.toFixed(1);
                })()}{' '}
                kg
              </span>

              <label>Over-engineering factor:</label>
              <div>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.05}
                  value={currentDesign.overEngineeringFactor ?? 1}
                  onChange={(e) =>
                    setCurrentDesign({
                      ...currentDesign,
                      overEngineeringFactor: Math.max(
                        1,
                        Math.min(2, parseFloat(e.target.value) || 1)
                      ),
                    })
                  }
                  style={{ ...stageFieldStyle, width: 80 }}
                />
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                  Multiplies base dry mass by this factor (1–5).
                </div>
              </div>

              {/* Dry mass after applying over-engineering factor */}
              <label>Dry mass (effective):</label>
              <span>
                {computeStageStats(currentDesign)
                  .reduce((sum, s) => sum + s.dryMass, 0)
                  .toFixed(1)}{' '}
                kg
              </span>

              <label>Structural material:</label>
              <select
                style={stageFieldStyle}
                value={currentDesign.structureMaterial ?? 'steel'}
                onChange={(e) =>
                  setCurrentDesign({
                    ...currentDesign,
                    structureMaterial: e.target.value as Material,
                  })
                }
              >
                {TANK_MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {MATERIAL_LABELS[m]}
                  </option>
                ))}
              </select>

              <label>Elongation:</label>
              <input
                style={stageFieldStyle}
                type="number"
                min={1}
                max={5}
                step={0.1}
                value={currentDesign.structureElongation ?? 1}
                onChange={(e) =>
                  setCurrentDesign({
                    ...currentDesign,
                    structureElongation: Math.max(
                      1,
                      Math.min(5, parseFloat(e.target.value) || 1)
                    ),
                  })
                }
              />

              <label>Aerodynamics:</label>
              <select
                style={stageFieldStyle}
                value={currentDesign.structureAerodynamics ?? 'cone'}
                onChange={(e) =>
                  setCurrentDesign({
                    ...currentDesign,
                    structureAerodynamics: e.target.value as AerodynamicsType,
                  })
                }
              >
                {AERODYNAMICS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <label>Max structural load (design) [N]:</label>
              <span>
                {(() => {
                  const effectiveDry = computeStageStats(currentDesign).reduce(
                    (sum, s) => sum + s.dryMass,
                    0
                  );
                  const material = currentDesign.structureMaterial ?? 'steel';
                  const limitPerKg = STRUCTURAL_LOAD_LIMIT_N_PER_KG[material];
                  return (effectiveDry * limitPerKg).toFixed(0);
                })()}{' '}
                N
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4>Stages</h4>
            <button
              onClick={addStage}
              disabled={currentDesign.stages.length >= maxStages}
              title={currentDesign.stages.length >= maxStages && maxStages < 3 ? 'Unlock 2nd or 3rd stage in the Upgrades tab.' : undefined}
              style={{
                opacity: currentDesign.stages.length >= maxStages ? 0.6 : 1,
                cursor: currentDesign.stages.length >= maxStages ? 'not-allowed' : 'pointer',
              }}
            >
              + Add stage
            </button>
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
              <label>Tank structure mass [kg]:</label>
              <span>{getTankDryMass(stage.fuelMass, stage.material).toFixed(1)}</span>
            </>
          )}
          {currentType === 'solid' && (
            <>
              <label>Energy density [MJ/kg]:</label>
              <span>{(SOLID_FUEL_PROPS[stage.solidFuelType ?? 'black-powder'].energyDensityJkg / 1e6).toFixed(2)}</span>
              <label>Density [kg/L]:</label>
              <span>{SOLID_FUEL_PROPS[stage.solidFuelType ?? 'black-powder'].densityKgL.toFixed(2)}</span>
              <label>Tank volume [L]:</label>
              <span>{fuelMassToVolumeL(stage.fuelMass, stage.solidFuelType ?? 'black-powder').toFixed(1)}</span>
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
          <label>Engine mass [kg]:</label>
          <span>{ENGINE_PROPS[stage.engineType ?? 'basic-exhaust'].massKg}</span>
          <label>Burn rate [L/s]:</label>
          <input
            style={stageFieldStyle}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={
              stage.burnRateOverrideLs ??
              ENGINE_PROPS[stage.engineType ?? 'basic-exhaust'].burnRateLs
            }
            onChange={(e) =>
              onUpdate({
                burnRateOverrideLs: Math.max(
                  0,
                  Math.min(1, parseFloat(e.target.value) || 0)
                ),
              })
            }
          />
          <label>Efficiency [%]:</label>
          <span>{(ENGINE_PROPS[stage.engineType ?? 'basic-exhaust'].efficiency * 100).toFixed(0)}</span>
          <label title="Seconds before burnout when thrust linearly ramps down to zero.">Burndown time [s]:</label>
          <input
            style={stageFieldStyle}
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={stage.burndownTime ?? 0}
            onChange={(e) =>
              onUpdate({
                burndownTime: Math.max(0, Math.min(20, parseFloat(e.target.value) || 0)),
              })
            }
          />
        </div>

        {stats != null && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '0.75rem 0' }} />
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#555', marginBottom: '0.5rem' }}>Summary</div>
            <div style={stageGridStyle}>
              <label>Dry mass [kg]:</label>
              <span>{stats.dryMass.toFixed(1)}</span>
              <label>Wet mass [kg]:</label>
              <span>{stats.wetMass.toFixed(1)}</span>
              <label>Burn duration [s]:</label>
              <span>{stats.burnDuration.toFixed(1)}</span>
              <label>Exhaust velocity [m/s]:</label>
              <span>{stats.exhaustVelocity.toFixed(0)}</span>
              <label>Thrust [N]:</label>
              <span>{stats.thrust.toFixed(0)}</span>
              <label>Acceleration at takeoff [m/s²]:</label>
              <span>{stats.accelerationAtTakeoff.toFixed(1)}</span>
              <label>Delta-v [m/s]:</label>
              <span>{stats.deltaV.toFixed(0)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
