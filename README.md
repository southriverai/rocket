# Rocket Simulator

A browser-based rocket design and simulation game with deterministic replays, built with React, TypeScript, Vite, and Web Workers.

## Features

- **Design Mode**: Add stages; each stage has fuel, engine, and nozzle
- **Sim Mode**: Run deterministic 2D physics simulations in a Web Worker
- **Replay Mode**: Record and replay simulations with timeline scrubbing
- **Charts**: Multiple time-series charts using uPlot (altitude, velocity, acceleration, dynamic pressure, mass, thrust, TWR)

## Architecture

### Core Modules

- `/src/sim/`: Core simulation logic
  - `simTypes.ts`: Type definitions
  - `prng.ts`: Seeded PRNG for determinism
  - `physics.ts`: 2D physics integration
  - `rocket.ts`: Rocket model (mass, thrust, staging)
  - `telemetry.ts`: Telemetry sampling and downsampling
  - `replay.ts`: Replay bundle serialization and checkpointing

- `/src/worker/`: Web Worker implementation
  - `simWorker.ts`: Worker entry point with Comlink RPC
  - `simController.ts`: Fixed-timestep simulation loop
  - `replayController.ts`: Replay playback and scrubbing

- `/src/state/`: Zustand store for app state

- `/src/ui/`: React UI components
  - `App.tsx`: Main app with mode switching
  - `components/`: Individual UI components

- `/src/utils/`: Utilities
  - `db.ts`: IndexedDB persistence

## Determinism

The simulation is deterministic through:

1. **Fixed Timestep**: All physics steps use a fixed `dt` (default 0.01s)
3. **Event-Driven**: State changes are driven by events with exact
## Replay System

Replays are stored as bundles containing:
- Metadata (schema version, seed, parameters)
- Rocket design
- Event log (throttle changes, staging, etc.)
- Checkpoints (periodic state snapshots)
- Optional cached telemetry (for fast chart loading)

To seek to time `t`:
1. Find nearest checkpoint `<= t`
2. Restore state from checkpoint
3. Re-simulate forward, applying events up to `t`

## Performance

- Charts update at ~10-20 Hz (not every frame)
- Telemetry uses typed arrays for efficient storage
- Simulation runs in Web Worker to avoid UI blocking

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
npm run preview
```

## TODOs / Future Enhancements

- [ ] More sophisticated physics (aerodynamics, torque, stability)
- [ ] 3D visualization of rocket trajectory
- [ ] More part types (fairings, RCS, parachutes)
- [ ] Multi-stage optimization
- [ ] Export/import replay files
- [ ] Telemetry filtering and analysis tools
- [ ] Performance profiling and optimization

## License

MIT
