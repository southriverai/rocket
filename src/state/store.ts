// Zustand store for app state

import { create } from 'zustand';
import type {
  RocketDesign,
  TelemetrySample,
  ReplayBundle,
  SimState,
} from '../sim/simTypes';

export type AppMode = 'design' | 'achievements' | 'upgrades';

export interface AchievementNotification {
  id: string;
  title: string;
  message: string;
}

export interface ChartSettings {
  showAltitude: boolean;
  showSpeed: boolean;
  showAcceleration: boolean;
  showQ: boolean;
  showMass: boolean;
  showThrust: boolean;
  showTWR: boolean;
}

export interface AppStore {
  // Mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  
  // Rocket design (slot-based)
  designSlots: (RocketDesign | null)[];
  currentSlotIndex: number | null;
  currentDesign: RocketDesign | null;
  setCurrentDesign: (design: RocketDesign | null) => void;
  openDesignSlot: (index: number) => void;
  backToDesignSlots: () => void;
  setDesignInCurrentSlot: (design: RocketDesign | null) => void;
  ensureDesignSlotsCount: (count: number) => void;
  
  // Simulation
  simRunning: boolean;
  simState: SimState | null;
  telemetry: TelemetrySample[];
  setSimRunning: (running: boolean) => void;
  setSimState: (state: SimState | null) => void;
  addTelemetrySample: (sample: TelemetrySample) => void;
  clearTelemetry: () => void;
  
  // Replay
  replays: ReplayBundle[];
  selectedReplayIds: string[];
  currentReplayTime: number;
  replayPlaying: boolean;
  replaySpeed: number;
  addReplay: (bundle: ReplayBundle) => void;
  removeReplay: (id: string) => void;
  setSelectedReplayIds: (ids: string[]) => void;
  setCurrentReplayTime: (t: number) => void;
  setReplayPlaying: (playing: boolean) => void;
  setReplaySpeed: (speed: number) => void;

  // Achievement notifications
  achievementNotifications: AchievementNotification[];
  pushAchievementNotification: (notification: AchievementNotification) => void;
  removeAchievementNotification: (id: string) => void;
  
  // Chart settings
  chartSettings: ChartSettings;
  updateChartSettings: (settings: Partial<ChartSettings>) => void;

  // Simulation config
  /** Simulation step size in seconds (fixed timestep). */
  simStepSize: number;
  setSimStepSize: (value: number) => void;

  // Money & upgrades
  money: number;
  /** Cash earned per second of simulation time. */
  cashPerSecond: number;
  unlockedUpgrades: string[];
  addMoney: (amount: number) => void;
  purchaseUpgrade: (upgradeId: string, cost: number) => void;

  // Achievements
  unlockedAchievements: string[];
  unlockAchievement: (id: string) => void;
}

const defaultChartSettings: ChartSettings = {
  showAltitude: true,
  showSpeed: true,
  showAcceleration: false,
  showQ: false,
  showMass: true,
  showThrust: true,
  showTWR: false,
};

export const useStore = create<AppStore>((set) => ({
  mode: 'design',
  setMode: (mode) => set({ mode }),
  
  designSlots: [null],
  currentSlotIndex: null,
  currentDesign: null,
  setCurrentDesign: (design) =>
    set((state) => {
      if (state.currentSlotIndex === null) return { currentDesign: design };
      const slots = [...state.designSlots];
      slots[state.currentSlotIndex] = design;
      return { currentDesign: design, designSlots: slots };
    }),
  openDesignSlot: (index) =>
    set((state) => {
      const slots = state.designSlots;
      const design = index < slots.length ? slots[index] ?? null : null;
      return { currentSlotIndex: index, currentDesign: design };
    }),
  backToDesignSlots: () =>
    set({ currentSlotIndex: null, currentDesign: null }),
  setDesignInCurrentSlot: (design) =>
    set((state) => {
      if (state.currentSlotIndex === null) return state;
      const slots = [...state.designSlots];
      while (slots.length <= state.currentSlotIndex) slots.push(null);
      slots[state.currentSlotIndex] = design;
      return { currentDesign: design, designSlots: slots };
    }),
  ensureDesignSlotsCount: (count) =>
    set((state) => {
      if (state.designSlots.length >= count) return state;
      const slots = [...state.designSlots];
      while (slots.length < count) slots.push(null);
      return { designSlots: slots };
    }),

  simRunning: false,
  simState: null,
  telemetry: [],
  setSimRunning: (running) => set({ simRunning: running }),
  setSimState: (state) => set({ simState: state }),
  addTelemetrySample: (sample) =>
    set((state) => ({
      telemetry: [...state.telemetry, sample],
    })),
  clearTelemetry: () => set({ telemetry: [] }),
  
  replays: [],
  selectedReplayIds: [],
  currentReplayTime: 0,
  replayPlaying: false,
  replaySpeed: 1.0,
  addReplay: (bundle) =>
    set((state) => ({
      replays: [...state.replays, bundle],
    })),
  removeReplay: (id) =>
    set((state) => ({
      replays: state.replays.filter((r) => r.metadata.createdAt.toString() !== id),
      selectedReplayIds: state.selectedReplayIds.filter((rid) => rid !== id),
    })),
  setSelectedReplayIds: (ids) => set({ selectedReplayIds: ids }),
  setCurrentReplayTime: (t) => set({ currentReplayTime: t }),
  setReplayPlaying: (playing) => set({ replayPlaying: playing }),
  setReplaySpeed: (speed) => set({ replaySpeed: speed }),
  achievementNotifications: [],
  pushAchievementNotification: (notification) =>
    set((state) => ({
      achievementNotifications: [...state.achievementNotifications, notification],
    })),
  removeAchievementNotification: (id) =>
    set((state) => ({
      achievementNotifications: state.achievementNotifications.filter((n) => n.id !== id),
    })),
  
  chartSettings: defaultChartSettings,
  updateChartSettings: (settings) =>
    set((state) => ({
      chartSettings: { ...state.chartSettings, ...settings },
    })),

  simStepSize: 0.02,
  setSimStepSize: (value) => set({ simStepSize: Math.max(0.01, Math.min(10, value)) }),

  money: 0,
  cashPerSecond: 10,
  unlockedUpgrades: [],
  addMoney: (amount) =>
    set((state) => ({ money: Math.max(0, state.money + amount) })),
  purchaseUpgrade: (upgradeId, cost) =>
    set((state) => {
      if (state.unlockedUpgrades.includes(upgradeId) || state.money < cost) return state;
      const newUnlocked = [...state.unlockedUpgrades, upgradeId];
      let newMax = 1;
      if (newUnlocked.includes('design-slot-2')) newMax = 2;
      if (newUnlocked.includes('design-slot-3')) newMax = 3;
      const slots =
        state.designSlots.length < newMax
          ? [...state.designSlots, ...Array(newMax - state.designSlots.length).fill(null)]
          : state.designSlots;
      return {
        money: state.money - cost,
        unlockedUpgrades: newUnlocked,
        designSlots: slots,
      };
    }),
  unlockedAchievements: [],
  unlockAchievement: (id) =>
    set((state) =>
      state.unlockedAchievements.includes(id)
        ? state
        : { unlockedAchievements: [...state.unlockedAchievements, id] }
    ),
}));
