export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** smootherstep: zero velocity AND acceleration at both ends, so motion feels hand-guided. */
export const easeInOut = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
