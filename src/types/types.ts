import type { ReactNode, CSSProperties } from "react";

export type El = HTMLElement | SVGElement;

/** "minimal": flat dashed boxes + plain cursor. "gradient": aurora palette, glow, dust, iris reveal. */
export type Variant = "minimal" | "gradient";

export type Kind = "frame" | "card" | "item" | "quick";

/* ------------------------------------------------------------------ */
/* Option groups (every field can be overridden on top of a variant)  */
/* ------------------------------------------------------------------ */

export interface CursorOptions {
  /** "plain": solid-colour arrow. "gradient": arrow filled with the palette. */
  style: "plain" | "gradient";
  /** Arrow size in px. */
  size: number;
  /** Soft rotating aurora orb behind the arrow. */
  halo: boolean;
  /** Arrow leans with its horizontal velocity. */
  tilt: boolean;
  /** Press-in / rebound when the cursor "clicks". */
  clickSquish: boolean;
  /** Show the name tag next to the cursor. */
  showLabel: boolean;
}

export interface BoxOptions {
  /** "dashed": flat dashed outline. "gradient": gradient hairline ring. */
  style: "dashed" | "gradient";
  /** "match": copy the element's own border-radius. Number: fixed px radius. */
  radius: "match" | number;
  /** Faint tinted fill while the box is being drawn. */
  fill: boolean;
  /** Static blurred palette glow behind the box. */
  glow: boolean;
  /** A comet of light orbiting the border while the box is active. */
  orbit: boolean;
  /** Gradient aura that softly breathes around the box while it is active. */
  breathing: boolean;
  /** Corner handles: none, small squares, or round dots. */
  handles: "none" | "square" | "dot";
  /** Show the element name above the box. */
  showName: boolean;
  /** Show the live "w × h" readout under the box. */
  showSize: boolean;
}

export interface TagOptions {
  /** "solid": coloured chip. "dark": dark chip with a hairline border. */
  style: "solid" | "dark";
  /** Corner radius in px. */
  radius: number;
}

export interface EffectOptions {
  /** Fine dust shed from the cursor as it moves. */
  dust: boolean;
  /** What happens on each click: nothing, a ring, or a ring + dust burst. */
  click: "none" | "ring" | "burst";
  /** How the real element appears: not animated, simple fade, or iris bloom. */
  reveal: "none" | "fade" | "iris";
  /** Soft outline that breathes out from the element as it appears. */
  revealOutline: "none" | "solid" | "gradient";
}

export interface PerfOptions {
  /** Hard cap on live dust particles. */
  maxParticles: number;
  /** 0–1 multiplier for dust amount, or "auto" (fewer particles on low-core devices). */
  particleDensity: number | "auto";
  /** The iris reveal skips its blur on elements larger than this many px². */
  irisBlurMaxArea: number;
}

/* ------------------------------------------------------------------ */
/* Public props                                                       */
/* ------------------------------------------------------------------ */

export interface DesignCursorConfig {
  /** Starting point for every option below. Default "gradient". */
  variant?: Variant;
  /** Primary colour (any CSS colour). */
  color?: string;
  /**
   * Full palette (2+ colours). When omitted, an aurora palette built from `color`
   * is used if any gradient feature is on, otherwise a single flat colour.
   */
  colors?: string[];
  /** Name tag shown next to the cursor. */
  label?: string;
  /** 1 = normal, 2 = twice as fast. */
  speed?: number;
  /** Replay the animation forever while in view. */
  loop?: boolean;
  replay?: boolean;
  /** Pause between loops (ms). */
  loopDelay?: number;
  /** Delay before the first run (ms). */
  startDelay?: number;
  /** How deep into the wrapped tree to draw boxes (1 = direct children only). */
  maxDepth?: number;
  /** Cap on boxes per run (default 14, or 80 with `selector`). */
  maxSteps?: number;
  selector?: string;
  /** Elements matching this are drawn very fast with no tags (grids of icons). */
  quickSelector?: string;
  /** "inView" starts when scrolled into view (and pauses when it leaves). */
  trigger?: "mount" | "inView";

  cursor?: Partial<CursorOptions>;
  box?: Partial<BoxOptions>;
  tag?: Partial<TagOptions>;
  effects?: Partial<EffectOptions>;
  performance?: Partial<PerfOptions>;
}

export interface DesignCursorProps extends DesignCursorConfig {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Called after each full pass finishes. */
  onComplete?: () => void;
}

/* ------------------------------------------------------------------ */
/* Internal                                                           */
/* ------------------------------------------------------------------ */

export interface ResolvedConfig {
  palette: string[];
  label: string;
  speed: number;
  loop: boolean;
  replay: boolean;
  loopDelay: number;
  startDelay: number;
  maxDepth: number;
  maxSteps?: number;
  selector?: string;
  quickSelector?: string;
  trigger: "mount" | "inView";
  cursor: CursorOptions;
  box: BoxOptions;
  tag: TagOptions;
  effects: EffectOptions;
  perf: PerfOptions;
}

export interface KindProfile {
  /** [min, max] ms for cursor travel to the box corner. */
  travel: [number, number];
  /** [min, max] ms for dragging the box open. */
  draw: [number, number];
  hold: number;
  settle: number;
  /** Whether this kind gets labels, glow, aura, etc. */
  chrome: boolean;
}
