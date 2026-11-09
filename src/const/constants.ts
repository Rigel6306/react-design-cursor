import type {
  BoxOptions,
  CursorOptions,
  EffectOptions,
  Kind,
  KindProfile,
  PerfOptions,
  TagOptions,
  Variant,
} from "../types/types";

/* ---------- colour ---------- */

export const DEFAULT_COLOR = "#7c5cff";
/** Colours appended after `color` to form the default aurora palette. */
export const AURORA_REST = ["#ff5fa2", "#ffb347", "#38d5ff"] as const;

/* ---------- easing curves (CSS) ---------- */

export const EASE_OUT_EXPO = "cubic-bezier(.22,1,.36,1)";
export const EASE_SOFT = "cubic-bezier(.4,0,.2,1)";

/* ---------- timing per kind of element, in ms ---------- */

export const PROFILE: Record<Kind, KindProfile> = {
  frame: { travel: [220, 420], draw: [480, 720], hold: 80, settle: 100, chrome: true },
  card: { travel: [190, 360], draw: [250, 420], hold: 40, settle: 60, chrome: true },
  item: { travel: [95, 200], draw: [120, 220], hold: 0, settle: 40, chrome: true },
  quick: { travel: [40, 70], draw: [50, 80], hold: 0, settle: 20, chrome: false },
};

/* ---------- walking the DOM ---------- */

export const SKIP_TAGS = new Set(["script", "style", "br", "wbr", "template", "noscript"]);
export const DEFAULT_MAX_STEPS = 14;
export const DEFAULT_MAX_STEPS_WITH_SELECTOR = 80;
/** Fallback radius when an element has none. */
export const FALLBACK_RADIUS = "6px";

/* ---------- defaults for plain props ---------- */

export const DEFAULTS = {
  variant: "gradient" as Variant,
  label: "Designer",
  speed: 1,
  loop: false,
  replay: true,
  loopDelay: 2800,
  startDelay: 500,
  maxDepth: 3,
  trigger: "inView" as const,
};

export const DEFAULT_PERF: PerfOptions = {
  maxParticles: 320,
  particleDensity: "auto",
  irisBlurMaxArea: 250_000,
};

/* ---------- variant presets ---------- */

interface Preset {
  cursor: CursorOptions;
  box: BoxOptions;
  tag: TagOptions;
  effects: EffectOptions;
}

/** The original look: flat dashed boxes, plain arrow, ring on click, simple fade. */
export const MINIMAL_PRESET: Preset = {
  cursor: { style: "plain", size: 22, halo: false, tilt: false, clickSquish: false, showLabel: true },
  box: {
    style: "dashed",
    radius: 0,
    fill: true,
    glow: false,
    orbit: false,
    breathing: false,
    handles: "square",
    showName: true,
    showSize: true,
  },
  tag: { style: "solid", radius: 4 },
  effects: { dust: false, click: "ring", reveal: "fade", revealOutline: "none" },
};

/** The aurora look: gradient everything, dust, orbiting light, breathing aura, iris reveal. */
export const GRADIENT_PRESET: Preset = {
  cursor: { style: "gradient", size: 24, halo: true, tilt: true, clickSquish: true, showLabel: true },
  box: {
    style: "gradient",
    radius: "match",
    fill: true,
    glow: true,
    orbit: true,
    breathing: true,
    handles: "none",
    showName: true,
    showSize: true,
  },
  tag: { style: "dark", radius: 4 },
  effects: { dust: true, click: "burst", reveal: "iris", revealOutline: "gradient" },
};

export const PRESETS: Record<Variant, Preset> = {
  minimal: MINIMAL_PRESET,
  gradient: GRADIENT_PRESET,
};

/* ---------- misc ---------- */

/** Keyframes per dust particle (more = smoother arc, slower to parse). */
export const MOTE_STEPS = 10;
/** Fade length (ms) for the iris reveal vs. the simple fade. */
export const REVEAL_MS = { iris: 820, irisQuick: 300, fade: 420 };
