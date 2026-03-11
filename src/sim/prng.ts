// Seeded PRNG for deterministic randomness
// Simple Linear Congruential Generator

export class SeededPRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Generate next random number in [0, 1)
  next(): number {
    // LCG parameters (from Numerical Recipes)
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return (this.seed >>> 0) / 2 ** 32;
  }

  // Generate random integer in [min, max]
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Generate random float in [min, max)
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  // Get current seed (for checkpointing)
  getSeed(): number {
    return this.seed;
  }

  // Set seed (for restoring from checkpoint)
  setSeed(seed: number): void {
    this.seed = seed;
  }
}
