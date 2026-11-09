import { clamp, easeInOut } from "../helpers/math";
import { mk } from "../helpers/dom";
import { tween, type Ctl } from "../helpers/async";
import type { Ctx } from "./context";
import type { Effects } from "./effects";
import { createTag } from "./label";

export interface Cursor {
  el: HTMLElement;
  pos: { x: number; y: number };
  /** Jump to a point (also sheds dust / tilts, per options). */
  set: (x: number, y: number) => void;
  /** Glide along a gentle curve. */
  moveTo: (x: number, y: number, ms: number, ctl: Ctl) => Promise<void>;
  click: () => void;
  show: () => void;
  hide: (ms?: number) => void;
}

/** @param H height of the component; no dust is shed while the cursor is below it. */
export const createCursor = (ctx: Ctx, effects: Effects, H: number): Cursor => {
  const { cfg, theme, registry } = ctx;
  const o = cfg.cursor;
  const gradient = o.style === "gradient";

  const el = mk("div", {
    position: "absolute",
    left: "0",
    top: "0",
    zIndex: "3",
    opacity: "0",
    transition: "opacity .3s",
    willChange: "transform",
    pointerEvents: "none",
  });

  /* ---------- optional aurora halo ---------- */
  if (o.halo) {
    const halo = mk("div", {
      position: "absolute",
      left: "-24px",
      top: "-26px",
      width: "56px",
      height: "56px",
      borderRadius: "50%",
      background: theme.conic,
      filter: "blur(14px)",
      opacity: "0.5",
      willChange: "transform, opacity",
    });
    registry.track(
      halo.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
        duration: 4500,
        iterations: Infinity,
        easing: "linear",
      })
    );
    registry.track(
      halo.animate({ opacity: [0.35, 0.7, 0.35] }, { duration: 2200, iterations: Infinity, easing: "ease-in-out" })
    );
    el.appendChild(halo);
  }

  /* ---------- arrow ---------- */
  const size = o.size;
  const scale = size / 24;
  const arrow = mk("div", { position: "relative", transformOrigin: `${4 * scale}px ${2 * scale}px` });
  const gid = `dcg${Math.random().toString(36).slice(2, 8)}`;
  const stops = theme.palette
    .map((c, i) => `<stop offset="${(i / Math.max(1, theme.n - 1)) * 100}%" stop-color="${c}"/>`)
    .join("");
  const fill = gradient ? `url(#${gid})` : theme.primary;
  const defs = gradient
    ? `<defs><linearGradient id="${gid}" x1="4" y1="2" x2="18" y2="20" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>`
    : "";
  const shadow = gradient ? "drop-shadow(0 3px 6px rgba(20,10,60,.35))" : "drop-shadow(0 2px 3px rgba(0,0,0,.25))";
  arrow.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="display:block;filter:${shadow}">${defs}<path d="M4 2.5l15 8.2-6.6 1.9-2.4 6.9L4 2.5z" fill="${fill}" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
  el.appendChild(arrow);

  /* ---------- name tag ---------- */
  if (o.showLabel) {
    const tag = createTag(ctx, cfg.label);
    tag.style.left = `${Math.round(size * 0.65)}px`;
    tag.style.top = `${Math.round(size * 0.9)}px`;
    el.appendChild(tag);
  }

  /* ---------- motion ---------- */
  const pos = { x: 0, y: 0 };
  let last: { x: number; y: number } | null = null;
  let tilt = 0;

  const set = (x: number, y: number) => {
    const vx = x - pos.x;
    pos.x = x;
    pos.y = y;
    el.style.transform = `translate3d(${x - 4}px, ${y - 2}px, 0)`;

    if (o.tilt) {
      /* low-pass the lean so it eases in and out instead of twitching */
      tilt += (clamp(vx * 0.7, -14, 14) - tilt) * 0.3;
      arrow.style.transform = `rotate(${tilt}deg)`;
    }

    if (cfg.effects.dust) {
      if (!last) last = { x, y };
      else if (y < H && Math.hypot(x - last.x, y - last.y) > 8) {
        effects.emitDust(x, y);
        last = { x, y };
      }
    }
  };

  const click = () => {
    if (!o.clickSquish) return;
    registry.track(
      arrow.animate({ scale: ["1", "0.84", "1.05", "1"] }, { duration: 340 / cfg.speed, easing: "ease-in-out" })
    );
  };

  const moveTo = (x: number, y: number, ms: number, ctl: Ctl) => {
    const sx = pos.x;
    const sy = pos.y;
    const dx = x - sx;
    const dy = y - sy;
    const dist = Math.hypot(dx, dy) || 1;
    const bend = Math.min(70, dist * 0.22) * (Math.random() < 0.5 ? -1 : 1);
    const cx = (sx + x) / 2 - (dy / dist) * bend;
    const cy = (sy + y) / 2 + (dx / dist) * bend;
    return tween(ms, ctl, (t) => {
      const e = easeInOut(t);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      set(a * sx + b * cx + c * x, a * sy + b * cy + c * y);
    });
  };

  const show = () => {
    el.style.opacity = "1";
  };
  const hide = (ms = 300) => {
    el.style.transition = `opacity ${ms}ms ease`;
    el.style.opacity = "0";
  };

  return { el, pos, set, moveTo, click, show, hide };
};
