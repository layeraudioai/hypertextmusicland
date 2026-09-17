export class SeededRNG {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    // LCG algorithm
    next(): number {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    // Helper to get next int in range [min, max)
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }
}
