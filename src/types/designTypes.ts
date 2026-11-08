export type El = HTMLElement | SVGElement;
export type Ctl = { cancelled: boolean };
export type Kind = "frame" | "card" | "item" | "quick";

export interface DesignCursorProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Primary colour (any CSS colour). Used as the first stop of the default aurora palette. */
  color?: string;
  /** Optional full palette (2+ colours, any CSS colours). Overrides the default aurora palette. */
  colors?: string[];
  /** Name tag shown next to the cursor. */
  label?: string;
  /** 1 = normal, 2 = twice as fast. */
  speed?: number;
  /** Replay the animation forever while in view. Default false. */
  loop?: boolean;
  replay?: boolean;
  /** Pause between loops (ms). */
  loopDelay?: number;
  /** Delay before the first run (ms). */
  startDelay?: number;
  /** How deep into the wrapped tree to draw boxes (1 = direct children only). */
  maxDepth?: number;
  /** Safety cap on the number of boxes drawn per run (default 14, or 80 with `selector`). */
  maxSteps?: number;
  selector?: string;
  /** Elements matching this are drawn very fast with no tags (grids of icons). */
  quickSelector?: string;
  /** "inView" starts when scrolled into view (and pauses when it leaves). */
  trigger?: "mount" | "inView";
}


