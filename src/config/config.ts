import { AURORA_REST, DEFAULTS, DEFAULT_COLOR, DEFAULT_PERF, PRESETS } from "../const/constants";
import type { DesignCursorConfig, ResolvedConfig } from "../types/types";

/** Shallow merge that ignores `undefined` overrides. */
const merge = <T extends object>(base: T, over?: Partial<T>): T => {
  const out = { ...base };
  if (over) {
    (Object.keys(over) as (keyof T)[]).forEach((k) => {
      if (over[k] !== undefined) out[k] = over[k] as T[keyof T];
    });
  }
  return out;
};

/** Turn user props into one fully-populated, serialisable config. */
export const resolveConfig = (opts: DesignCursorConfig): ResolvedConfig => {
  const variant = opts.variant ?? DEFAULTS.variant;
  const preset = PRESETS[variant];

  const cursor = merge(preset.cursor, opts.cursor);
  const box = merge(preset.box, opts.box);
  const tag = merge(preset.tag, opts.tag);
  const effects = merge(preset.effects, opts.effects);
  const perf = merge(DEFAULT_PERF, opts.performance);

  const color = opts.color ?? DEFAULT_COLOR;

  /* Multi-colour palette only when something actually uses it (or the caller asks). */
  const usesGradient =
    cursor.style === "gradient" ||
    cursor.halo ||
    box.style === "gradient" ||
    box.glow ||
    box.orbit ||
    box.breathing ||
    effects.dust ||
    effects.click === "burst" ||
    effects.revealOutline === "gradient";

  let palette: string[];
  if (opts.colors && opts.colors.length > 1) palette = opts.colors;
  else if (usesGradient) palette = [color, ...AURORA_REST];
  else palette = [color, color]; // gradients need 2+ stops; a repeated colour stays flat

  return {
    palette,
    label: opts.label ?? DEFAULTS.label,
    speed: Math.max(0.1, opts.speed ?? DEFAULTS.speed),
    loop: opts.loop ?? DEFAULTS.loop,
    replay: opts.replay ?? DEFAULTS.replay,
    loopDelay: opts.loopDelay ?? DEFAULTS.loopDelay,
    startDelay: opts.startDelay ?? DEFAULTS.startDelay,
    maxDepth: opts.maxDepth ?? DEFAULTS.maxDepth,
    maxSteps: opts.maxSteps,
    selector: opts.selector,
    quickSelector: opts.quickSelector,
    trigger: opts.trigger ?? DEFAULTS.trigger,
    cursor,
    box,
    tag,
    effects,
    perf,
  };
};
