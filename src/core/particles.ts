import { MOTE_STEPS } from "../const/constants";
import { mk } from "../helpers/dom";
import type { Registry } from "./registry";

export interface MoteOpts {
  /** Total outward drift (px). */
  dx: number;
  dy: number;
  /** Slow fall under gravity (px). */
  g: number;
  /** Lifetime (ms). */
  dur: number;
  delay?: number;
  /** Core size (px). */
  size: number;
  color: string;
  alpha: number;
  /** A tiny 4-point glint instead of a soft speck. */
  glint?: boolean;
  /** Sway amplitude (px). */
  wobble?: number;
}

export interface Particles {
  mote: (x: number, y: number, o: MoteOpts) => void;
  /** Forget pooled elements (call when the overlay is emptied). */
  reset: () => void;
}

type Kind = "dot" | "glint";

const GLINT_CLIP =
  "polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%)";

/**
 * Dust particles. Elements are pooled and reused: no DOM churn, and one static background
 * per kind (the colour comes from a CSS variable), so a particle costs a transform/opacity
 * animation and little else.
 */
export const createParticles = (
  overlay: HTMLElement,
  registry: Registry,
  maxLive: number
): Particles => {
  const pools: Record<Kind, HTMLElement[]> = { dot: [], glint: [] };
  let live = 0;

  const make = (kind: Kind) => {
    const el = mk("div", {
      position: "absolute",
      left: "0",
      top: "0",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "2",
      willChange: "transform, opacity",
      ...(kind === "glint"
        ? { background: "linear-gradient(135deg, #fff 0%, var(--c) 100%)", clipPath: GLINT_CLIP }
        : {
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,.95) 0%, var(--c) 30%, transparent 68%)",
          }),
    });
    overlay.appendChild(el);
    return el;
  };

  const mote = (x: number, y: number, o: MoteOpts) => {
    if (live >= maxLive) return;
    live++;

    const kind: Kind = o.glint ? "glint" : "dot";
    const el = pools[kind].pop() ?? make(kind);

    const s = o.size;
    const w = o.glint ? s : s * 2.6;
    const h = o.glint ? s : w * (0.55 + Math.random() * 0.45); // slightly squashed: no two alike
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.setProperty("--c", o.color);

    const bx = x - w / 2;
    const by = y - h / 2;
    const phase = Math.random() * Math.PI * 2;
    const freq = 1.5 + Math.random() * 2;
    const wob = o.wobble ?? 3;
    const len = Math.hypot(o.dx, o.dy) || 1;
    const nx = -o.dy / len;
    const ny = o.dx / len;
    const rot0 = Math.random() * 90;
    const spinBy = (Math.random() - 0.5) * 140;

    const frames: Keyframe[] = [];
    for (let k = 0; k <= MOTE_STEPS; k++) {
      const t = k / MOTE_STEPS;
      const e = 1 - Math.pow(1 - t, 2.2); // drag: quick start, long glide
      const sway = Math.sin(t * Math.PI * freq + phase) * wob * t;
      const px = bx + o.dx * e + nx * sway;
      const py = by + o.dy * e + ny * sway + o.g * t * t;
      const fadeIn = Math.min(1, t / 0.12);
      const fadeOut = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      const twinkle = o.glint ? 1 : 0.72 + 0.28 * Math.sin(t * Math.PI * (4 + freq * 2) + phase);
      const sc = o.glint ? (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7) : 1 - t * 0.45;
      const rot = o.glint ? ` rotate(${rot0 + spinBy * t}deg)` : "";
      frames.push({
        transform: `translate3d(${px}px, ${py}px, 0)${rot} scale(${Math.max(0.001, sc)})`,
        opacity: o.alpha * fadeIn * fadeOut * twinkle,
        offset: t,
      });
    }

    const anim = registry.track(
      el.animate(frames, { duration: o.dur, delay: o.delay ?? 0, easing: "linear", fill: "both" })
    );
    anim.addEventListener(
      "finish",
      () => {
        anim.cancel(); // drops the fill; element returns to its invisible base style
        pools[kind].push(el);
        live = Math.max(0, live - 1);
      },
      { once: true }
    );
  };

  const reset = () => {
    pools.dot.length = 0;
    pools.glint.length = 0;
    live = 0;
  };

  return { mote, reset };
};
