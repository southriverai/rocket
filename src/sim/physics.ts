// 2D physics integration with RK4 and deterministic fixed timestep

import type { SimState, SimParams } from './simTypes';

export interface Forces {
  thrust: { x: number; y: number };
  drag: { x: number; y: number };
  gravity: { x: number; y: number };
  total: { x: number; y: number };
}

export function computeForces(
  state: SimState,
  params: SimParams,
  altitude: number
): Forces {
  const { rotation, currentThrust, currentMass, velocity } = state;
  
  // Thrust force (along rocket axis)
  const thrustMag = currentThrust;
  const thrust = {
    x: thrustMag * Math.sin(rotation),
    y: thrustMag * Math.cos(rotation),
  };
  
  // Gravity (downward)
  const gravity = {
    x: 0,
    y: -params.gravity * currentMass,
  };
  
  // Drag (opposite to velocity): F_drag = 0.5 * ρ * v² * (crossSection × frictionCoeff)
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
  const density = params.seaLevelDensity * Math.exp(-altitude / params.scaleHeight);
  const dragArea = state.currentDragArea ?? params.dragCoeff;
  const dragMag = speed > 0 ? 0.5 * density * speed ** 2 * dragArea : 0;
  const drag = speed > 0
    ? {
        x: -dragMag * (velocity.x / speed),
        y: -dragMag * (velocity.y / speed),
      }
    : { x: 0, y: 0 };
  
  // Total force
  const total = {
    x: thrust.x + drag.x + gravity.x,
    y: thrust.y + drag.y + gravity.y,
  };
  
  return { thrust, drag, gravity, total };
}

/** ODE state vector: [x, y, vx, vy, rotation, angularVelocity] */
type MechState = [number, number, number, number, number, number];

/** Continuous angular damping so that over 1 s, omega -> omega * 0.99 */
const ANGULAR_DAMPING_LOG = Math.log(0.99);

/** Compute dy/dt for mechanical state y0, with fixed mass, thrust, and drag area (for RK4 sub-steps). */
function mechanicsDerivative(
  y0: MechState,
  mass: number,
  thrust: number,
  params: SimParams,
  dragArea?: number
): MechState {
  const [, y, vx, vy, rotation, omega] = y0;
  const altitude = Math.max(0, y);
  const speed = Math.sqrt(vx * vx + vy * vy);
  const density = params.seaLevelDensity * Math.exp(-altitude / params.scaleHeight);
  const area = dragArea ?? params.dragCoeff;
  const dragMag = speed > 0 ? 0.5 * density * speed * speed * area : 0;
  const ax = (thrust * Math.sin(rotation) + (speed > 0 ? -dragMag * (vx / speed) : 0)) / mass;
  const ay = (thrust * Math.cos(rotation) - params.gravity * mass + (speed > 0 ? -dragMag * (vy / speed) : 0)) / mass;
  const alphaOmega = ANGULAR_DAMPING_LOG * omega;
  return [vx, vy, ax, ay, omega, alphaOmega];
}

/** Return derivative vector [dx, dy, dvx, dvy, d(rotation), d(omega)] for adaptive timestep checks. */
export function getMechanicsDerivative(
  state: SimState,
  params: SimParams
): MechState {
  const y0: MechState = [
    state.position.x,
    state.position.y,
    state.velocity.x,
    state.velocity.y,
    state.rotation,
    state.angularVelocity,
  ];
  return mechanicsDerivative(y0, state.currentMass, state.currentThrust, params, state.currentDragArea);
}

/** Single RK4 step: y1 = y0 + (dt/6)*(k1 + 2*k2 + 2*k3 + k4). */
function rk4Step(
  y0: MechState,
  dt: number,
  mass: number,
  thrust: number,
  params: SimParams,
  dragArea?: number
): MechState {
  const k1 = mechanicsDerivative(y0, mass, thrust, params, dragArea);
  const y1: MechState = [
    y0[0] + 0.5 * dt * k1[0],
    y0[1] + 0.5 * dt * k1[1],
    y0[2] + 0.5 * dt * k1[2],
    y0[3] + 0.5 * dt * k1[3],
    y0[4] + 0.5 * dt * k1[4],
    y0[5] + 0.5 * dt * k1[5],
  ];
  const k2 = mechanicsDerivative(y1, mass, thrust, params, dragArea);
  const y2: MechState = [
    y0[0] + 0.5 * dt * k2[0],
    y0[1] + 0.5 * dt * k2[1],
    y0[2] + 0.5 * dt * k2[2],
    y0[3] + 0.5 * dt * k2[3],
    y0[4] + 0.5 * dt * k2[4],
    y0[5] + 0.5 * dt * k2[5],
  ];
  const k3 = mechanicsDerivative(y2, mass, thrust, params, dragArea);
  const y3: MechState = [
    y0[0] + dt * k3[0],
    y0[1] + dt * k3[1],
    y0[2] + dt * k3[2],
    y0[3] + dt * k3[3],
    y0[4] + dt * k3[4],
    y0[5] + dt * k3[5],
  ];
  const k4 = mechanicsDerivative(y3, mass, thrust, params, dragArea);
  return [
    y0[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    y0[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    y0[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    y0[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
    y0[4] + (dt / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]),
    y0[5] + (dt / 6) * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5]),
  ];
}

export function integratePhysics(
  state: SimState,
  _forces: Forces | null,
  params: SimParams,
  dt: number
): SimState {
  const { position, velocity, rotation, angularVelocity, currentMass, currentThrust } = state;
  const y0: MechState = [
    position.x,
    position.y,
    velocity.x,
    velocity.y,
    rotation,
    angularVelocity,
  ];
  const y1 = rk4Step(y0, dt, currentMass, currentThrust, params, state.currentDragArea);
  return {
    ...state,
    position: { x: y1[0], y: y1[1] },
    velocity: { x: y1[2], y: y1[3] },
    rotation: y1[4],
    angularVelocity: y1[5],
  };
}
