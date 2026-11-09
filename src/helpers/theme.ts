/** Colour helpers derived once from the palette. */
export interface Theme {
  palette: string[];
  n: number;
  primary: string;
  second: string;
  last: string;
  /** `colour` at `pct`% opacity. */
  mix: (c: string, pct: number) => string;
  /** Linear gradient through the palette (optionally at `alpha`% opacity). */
  grad: (deg: number, alpha?: number) => string;
  /** Full-circle conic gradient through the palette. */
  conic: string;
  /** Bright head with a fading tail: reads as a light orbiting a box. */
  comet: string;
}

const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export const createTheme = (palette: string[]): Theme => {
  const n = palette.length;
  return {
    palette,
    n,
    primary: palette[0],
    second: palette[1] ?? palette[0],
    last: palette[n - 1],
    mix,
    grad: (deg, alpha) =>
      `linear-gradient(${deg}deg, ${palette.map((c) => (alpha == null ? c : mix(c, alpha))).join(", ")})`,
    conic: `conic-gradient(from 0deg, ${[...palette, palette[0]].join(", ")})`,
    comet: `conic-gradient(from 0deg, transparent 0deg, transparent 140deg, ${palette
      .map((c, i) => `${c} ${190 + (i / Math.max(1, n - 1)) * 170}deg`)
      .join(", ")})`,
  };
};
