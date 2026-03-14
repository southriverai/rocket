// Core types for rocket design, simulation state, and replay

export type PartType = 'tank' | 'engine' | 'fin';

/** Casing material: affects tank dry weight (and optionally other part mass). */
export type Material = 'steel' | 'paper' | 'plastic' | 'carbon';

/** Stage propulsion type. Only solid is available initially; others are upgrades. */
export type StageType = 'solid' | 'liquid' | 'electromagnetic' | 'nuclear';

/** Solid fuel subtype; used when stageType is 'solid'. Each has energy density (J/kg) and density (kg/L). */
export type SolidFuelType = 'black-powder' | 'ammonium-perchlorate';

/** Engine type; each has a burn rate (L/s). Only basic-exhaust is available initially. */
export type EngineType = 'basic-exhaust';

/** Nose / aerodynamics shape; sets drag (friction) coefficient. */
export type AerodynamicsType = 'cone' | 'parabola' | 'ogive' | 'von-karman';

/** Friction coefficient by aerodynamics shape (used for drag = crossSection × coeff). */
export const AERODYNAMICS_COEFF: Record<AerodynamicsType, number> = {
  cone: 0.5,
  parabola: 0.4,
  ogive: 0.3,
  'von-karman': 0.2,
};

export const AERODYNAMICS_OPTIONS: { value: AerodynamicsType; label: string; coeff: number }[] = [
  { value: 'cone', label: 'Cone (0.5)', coeff: 0.5 },
  { value: 'parabola', label: 'Parabola (0.4)', coeff: 0.4 },
  { value: 'ogive', label: 'Ogive (0.3)', coeff: 0.3 },
  { value: 'von-karman', label: 'Von Kármán (0.2)', coeff: 0.2 },
];

/** One stage: fuel (tank) and engine. Designer adds stages. */
export interface Stage {
  id: string;
  /** Propulsion type; defaults to 'solid' if missing (e.g. legacy designs). */
  stageType?: StageType;
  /** When stageType is 'solid', which solid propellant (energy density, density). */
  solidFuelType?: SolidFuelType;
  /** Engine type (burn rate, mass, thrust, isp). Defaults to 'basic-exhaust'. */
  engineType?: EngineType;
  fuelMass: number;   // kg
  /** Optional override for engine burn rate in L/s (0–1). */
  burnRateOverrideLs?: number;
  /** Seconds before burnout where thrust linearly ramps down to zero. */
  burndownTime?: number;
  /** Tank shape: 1 = sphere, 2–5 = capsule (height/diameter = elongation; higher = thinner and taller). */
  elongation?: number;
  /** Aerodynamics shape (sets friction coefficient for drag). */
  aerodynamics?: AerodynamicsType;
  /** Friction coefficient for drag when aerodynamics not set; drag force uses crossSection × frictionCoeff. */
  frictionCoeff?: number;
  /** Legacy: used when engineType is not set. */
  thrust?: number;    // N
  /** Legacy: used when engineType is not set. */
  isp?: number;       // s
  material?: Material; // casing material for dry mass
}

export interface Part {
  id: string;
  type: PartType;
  mass: number;
  fuelMass?: number;
  material?: Material;
  thrust?: number;
  isp?: number;
  throttleable?: boolean;
  liftCoeff?: number;
  area?: number;
  /** Cross-section area (m²) for drag; used with frictionCoeff. */
  crossSection?: number;
  /** Friction coefficient for this part (drag ∝ crossSection × frictionCoeff). */
  frictionCoeff?: number;
}

/** Design is a list of stages (top to bottom). Converted to parts for sim. */
export interface RocketDesign {
  id: string;
  name: string;
  stages: Stage[];
  /** Over-engineering factor for dry mass (1–2). */
  overEngineeringFactor?: number;
  /** Structural material and shape shared by all stages. */
  structureMaterial?: Material;
  structureElongation?: number;
  structureAerodynamics?: AerodynamicsType;
  /** Set when passing to sim worker (generated from stages). */
  parts?: Part[];
  /** Stage part IDs for buildStages; set when passing to sim. */
  _stageIds?: string[][];
  createdAt: number;
}

export interface SimParams {
  dt: number; // fixed timestep in seconds
  gravity: number; // m/s² (default 9.81)
  seaLevelDensity: number; // kg/m³ (default 1.225)
  scaleHeight: number; // m (default 8400 for Earth)
  dragCoeff: number; // CdA multiplier (default 0.5)
}

export interface SimState {
  t: number; // time in seconds
  position: { x: number; y: number }; // position in m (x=horizontal, y=vertical/altitude)
  velocity: { x: number; y: number }; // velocity in m/s
  rotation: number; // angle in radians (0 = vertical up)
  angularVelocity: number; // rad/s
  
  // Rocket state
  activeParts: Set<string>; // part IDs still attached
  currentMass: number; // total mass in kg
  currentFuel: number; // total fuel in kg
  currentThrust: number; // current thrust in N
  throttle: number; // 0-1
  /** Effective drag area (m²): crossSection × frictionCoeff of frontal stage; used for drag force. */
  currentDragArea?: number;
  
  // Staging
  currentStage: number; // current stage index
  stages: string[][]; // part IDs grouped by stage
}

export interface TelemetrySample {
  t: number;
  altitude: number;
  speed: number;
  verticalSpeed: number;
  acceleration: number;
  /** Drag force magnitude (N); friction losses in flight. */
  friction: number;
  mass: number;
  thrust: number;
  twr: number; // thrust-to-weight ratio
  airDensity: number; // kg/m³ at current altitude
  /** Structural load (N/kg of dry mass). */
  structuralLoad?: number;
  /** Timestep used at this sample (adaptive sim). */
  dt?: number;
  /** Max fraction of change per timestep (0.01 = 1%); convert to % only when displaying. */
  simInstability?: number;
  /** Fractional change per timestep per metric (0.01 = 1%); convert to % only when displaying. */
  pctChangePerStep?: Partial<Record<string, number>>;
}

export type EventType = 'throttle' | 'stage' | 'start' | 'stop';

export interface EventLogItem {
  t: number;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface Checkpoint {
  t: number;
  state: SimState;
}

export interface ReplayBundle {
  metadata: {
    schemaVersion: string;
    createdAt: number;
    seed: number;
    dt: number;
    simParams: SimParams;
    rocketDesignHash: string;
  };
  rocketDesign: RocketDesign;
  events: EventLogItem[];
  checkpoints: Checkpoint[];
  cachedDownsampledTelemetry?: TelemetrySample[];
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  dt: 1, // 1 second timestep
  gravity: 9.81,
  seaLevelDensity: 1.225,
  scaleHeight: 8400,
  dragCoeff: 0.5,
};
