import React, { useEffect, useRef } from "react";
import { clamp,easeInOut,easeOut,sleep,tween,collect } from "./utils/designCursorUtils";

import { PROFILE,CANCEL } from "./const/constents";

import { El,Ctl,DesignCursorProps,Kind } from "./types/designTypes";







/** Timing per kind, in ms: [min, max] for cursor travel and for the drag. */

/** Element rect clipped by any overflow-hidden ancestor (so a globe that
 *  spills out of its card is drawn only where it is actually visible). */
const visibleRect = (el: El, stop: Element) => {
  const r = el.getBoundingClientRect();
  let left = r.left;
  let top = r.top;
  let right = r.right;
  let bottom = r.bottom;
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      const pr = p.getBoundingClientRect();
      left = Math.max(left, pr.left);
      top = Math.max(top, pr.top);
      right = Math.min(right, pr.right);
      bottom = Math.min(bottom, pr.bottom);
    }
  }
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

/** The element's own corner radius, so selection boxes hug its shape. */
const radiusOf = (el: El) => {
  const r = getComputedStyle(el).borderRadius;
  return !r || r === "0px" ? "6px" : r;
};

/** Tiny element factory. */
const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, css: Partial<CSSStyleDeclaration> = {}) => {
  const e = document.createElement(tag);
  Object.assign(e.style, css);
  return e;
};

const DEFAULT_REST = ["#ff5fa2", "#ffb347", "#38d5ff"];

export const DesignCursor = ({
  children,
  className,
  style,
  color = "#7c5cff",
  colors,
  label = "Designer",
  speed = 1,
  loop = false,
  replay = true,
  loopDelay = 2800,
  startDelay = 500,
  maxDepth = 3,
  maxSteps,
  selector,
  quickSelector,
  trigger = "inView",
}: DesignCursorProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* string key so a new array literal each render doesn't restart the effect */
  const paletteKey = colors && colors.length > 1 ? colors.join("|") : "";

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const overlay = overlayRef.current;
    if (!root || !content || !overlay) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      content.style.visibility = "visible";
      return;
    }

    const hidden = new Map<El, string>();
    const restoreAll = () => {
      hidden.forEach((v, el) => {
        el.style.visibility = v;
      });
      hidden.clear();
    };

    /* number of dust particles currently alive (capped for performance) */
    let live = 0;
    const MAX_LIVE = 420;
    const clearOverlay = () => {
      overlay.replaceChildren();
      live = 0;
    };

    /* ---------- palette ---------- */

    const palette = paletteKey ? paletteKey.split("|") : [color, ...DEFAULT_REST];
    const n = palette.length;
    const P0 = palette[0];
    const P1 = palette[1];
    const P3 = palette[n - 1];
    const mixc = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
    const grad = (deg: number, alpha?: number) =>
      `linear-gradient(${deg}deg, ${palette.map((c) => (alpha == null ? c : mixc(c, alpha))).join(", ")})`;
    const conicFull = `conic-gradient(from 0deg, ${[...palette, P0].join(", ")})`;
    /* a bright head with a fading tail: reads as a light orbiting the box */
    const comet = `conic-gradient(from 0deg, transparent 0deg, transparent 140deg, ${palette
      .map((c, i) => `${c} ${190 + (i / (n - 1)) * 170}deg`)
      .join(", ")})`;

    const EASE_OUT_EXPO = "cubic-bezier(.22,1,.36,1)";
    const EASE_SOFT = "cubic-bezier(.4,0,.2,1)";

    /* ---------- minimal label ---------- */

    const pill = (text: string, o: { dot?: boolean; mono?: boolean } = {}) => {
      const el = mk("span", {
        position: "absolute",
        padding: o.mono ? "3px 6px" : "3px 7px",
        borderRadius: "4px",
        background: "rgba(16,16,28,.92)",
        border: "1px solid rgba(255,255,255,.12)",
        color: "#fff",
        font: o.mono
          ? "500 10.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace"
          : "600 11px/1.2 system-ui, -apple-system, Segoe UI, sans-serif",
        letterSpacing: ".01em",
        whiteSpace: "nowrap",
        transition: "opacity .25s",
        pointerEvents: "none",
      });
      el.textContent = text;
      return { el, text: el };
    };

    /* ---------- dust ----------
       One particle: a soft-edged speck (or, rarely, a tiny 4-point glint) that
       fades in, drifts outward with drag, sways, slowly settles under a touch of
       gravity, twinkles, and fades away. */

    interface MoteOpts {
      dx: number; // total outward drift (px)
      dy: number;
      g: number; // slow fall (px)
      dur: number; // ms
      delay?: number;
      size: number; // px (core size)
      color: string;
      alpha: number;
      glint?: boolean;
      wobble?: number; // sway amplitude (px)
    }

    const mote = (x: number, y: number, o: MoteOpts) => {
      if (live >= MAX_LIVE) return;
      live++;
      const s = o.size;
      let el: HTMLElement;
      if (o.glint) {
        el = mk("div", {
          position: "absolute",
          left: `${x - s / 2}px`,
          top: `${y - s / 2}px`,
          width: `${s}px`,
          height: `${s}px`,
          background: `linear-gradient(135deg, #fff 0%, ${o.color} 100%)`,
          clipPath: "polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%)",
          opacity: "0",
          pointerEvents: "none",
          zIndex: "2",
          willChange: "transform, opacity",
        });
      } else {
        /* soft halo box around a tiny bright core; slightly squashed so no two look alike */
        const w = s * 2.6;
        const h = w * (0.55 + Math.random() * 0.45);
        el = mk("div", {
          position: "absolute",
          left: `${x - w / 2}px`,
          top: `${y - h / 2}px`,
          width: `${w}px`,
          height: `${h}px`,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,255,255,.95) 0%, ${o.color} 30%, ${mixc(o.color, 0)} 68%)`,
          opacity: "0",
          pointerEvents: "none",
          zIndex: "2",
          willChange: "transform, opacity",
        });
      }
      overlay.appendChild(el);

      const steps = 12;
      const phase = Math.random() * Math.PI * 2;
      const freq = 1.5 + Math.random() * 2;
      const wob = o.wobble ?? 3;
      const len = Math.hypot(o.dx, o.dy) || 1;
      const nx = -o.dy / len;
      const ny = o.dx / len;
      const rot0 = Math.random() * 90;
      const spinBy = (Math.random() - 0.5) * 140;

      const frames = Array.from({ length: steps + 1 }, (_, k) => {
        const t = k / steps;
        const e = 1 - Math.pow(1 - t, 2.2); // drag: quick start, long glide
        const sway = Math.sin(t * Math.PI * freq + phase) * wob * t;
        const px = o.dx * e + nx * sway;
        const py = o.dy * e + ny * sway + o.g * t * t;
        const fadeIn = Math.min(1, t / 0.12);
        const fadeOut = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
        const twinkle = o.glint ? 1 : 0.72 + 0.28 * Math.sin(t * Math.PI * (4 + freq * 2) + phase);
        const sc = o.glint ? (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7) : 1 - t * 0.45;
        return {
          transform: `translate(${px}px, ${py}px) rotate(${rot0 + spinBy * t}deg) scale(${Math.max(0.001, sc)})`,
          opacity: o.alpha * fadeIn * fadeOut * twinkle,
          offset: t,
        };
      });

      const a = el.animate(frames, {
        duration: o.dur,
        delay: o.delay ?? 0,
        easing: "linear",
        fill: "both",
      });
      a.onfinish = () => {
        el.remove();
        live = Math.max(0, live - 1);
      };
    };

    /* a few fine specks (and now and then a glint) shed from the cursor tip */
    let dustIdx = 0;
    const emitDust = (x: number, y: number) => {
      const count = Math.random() < 0.25 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 8 + Math.random() * 24;
        const glint = Math.random() < 0.07;
        const c = Math.random() < 0.35 ? "#fff" : palette[dustIdx++ % n];
        mote(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, {
          dx: Math.cos(ang) * dist * 0.8,
          dy: Math.sin(ang) * dist * 0.8,
          g: 6 + Math.random() * 16,
          dur: (900 + Math.random() * 900) / speed,
          size: glint ? 6 + Math.random() * 3 : 0.9 + Math.pow(Math.random(), 2.2) * 2.2,
          color: c,
          alpha: glint ? 0.9 : 0.45 + Math.random() * 0.4,
          glint,
          wobble: 2 + Math.random() * 4,
        });
      }
    };

    /* ---------- click burst: one soft ring + a puff of fine dust ---------- */

    let burstIdx = 0;
    const burst = (x: number, y: number) => {
      const c0 = palette[burstIdx++ % n];
      const ring = mk("div", {
        position: "absolute",
        left: `${x - 12}px`,
        top: `${y - 12}px`,
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        border: `1.5px solid ${c0}`,
        boxShadow: `0 0 14px ${mixc(c0, 45)}`,
        pointerEvents: "none",
        zIndex: "2",
      });
      overlay.appendChild(ring);
      const ra = ring.animate(
        [
          { transform: "scale(.3)", opacity: 0.8 },
          { transform: "scale(2.3)", opacity: 0 },
        ],
        { duration: 760 / speed, easing: EASE_OUT_EXPO }
      );
      ra.onfinish = () => ring.remove();

      for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 14 + Math.random() * 30;
        mote(x, y, {
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist,
          g: 8 + Math.random() * 14,
          dur: (800 + Math.random() * 700) / speed,
          delay: (Math.random() * 60) / speed,
          size: 0.9 + Math.pow(Math.random(), 2) * 2.2,
          color: Math.random() < 0.3 ? "#fff" : palette[(i + burstIdx) % n],
          alpha: 0.5 + Math.random() * 0.4,
          wobble: 2 + Math.random() * 4,
        });
      }
      for (let i = 0; i < 2; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 22;
        mote(x, y, {
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist,
          g: 6,
          dur: (900 + Math.random() * 500) / speed,
          size: 6 + Math.random() * 4,
          color: palette[(i + burstIdx) % n],
          alpha: 1,
          glint: true,
        });
      }
    };

    /* a single soft outline that breathes out from the element as it appears */
    const breathe = (x: number, y: number, w: number, h: number, radius: string, ms: number) => {
      const ring = mk("div", {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        boxSizing: "border-box",
        borderRadius: radius,
        border: `1px solid ${mixc(P0, 70)}`,
        boxShadow: `0 0 16px ${mixc(P1, 28)}`,
        pointerEvents: "none",
        zIndex: "2",
      });
      overlay.appendChild(ring);
      const a = ring.animate(
        [
          { transform: "scale(1)", opacity: 0 },
          { opacity: 0.8, offset: 0.25 },
          { transform: `scale(${1 + clamp(14 / Math.max(w, h), 0.012, 0.06)})`, opacity: 0 },
        ],
        { duration: ms * 1.4, easing: EASE_OUT_EXPO }
      );
      a.onfinish = () => ring.remove();
    };

    /* ---------- cursor: aurora orb, gradient pointer, glass name tag ---------- */

    const makeCursor = (H: number) => {
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

      const halo = mk("div", {
        position: "absolute",
        left: "-24px",
        top: "-26px",
        width: "56px",
        height: "56px",
        borderRadius: "50%",
        background: conicFull,
        filter: "blur(14px)",
        opacity: "0.5",
      });
      halo.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 4500, iterations: Infinity, easing: "linear" }
      );
      halo.animate(
        { opacity: [0.35, 0.7, 0.35] },
        { duration: 2200, iterations: Infinity, easing: "ease-in-out" }
      );

      const arrow = mk("div", {
        position: "relative",
        transformOrigin: "4px 2px",
      });
      const gid = `dcg${Math.random().toString(36).slice(2, 8)}`;
      const stops = palette
        .map((c, i) => `<stop offset="${(i / (n - 1)) * 100}%" stop-color="${c}"/>`)
        .join("");
      arrow.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="display:block;filter:drop-shadow(0 3px 6px rgba(20,10,60,.35))"><defs><linearGradient id="${gid}" x1="4" y1="2" x2="18" y2="20" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs><path d="M4 2.5l15 8.2-6.6 1.9-2.4 6.9L4 2.5z" fill="url(#${gid})" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

      const tag = pill(label, { dot: true });
      tag.el.style.left = "16px";
      tag.el.style.top = "22px";

      el.append(halo, arrow, tag.el);

      const pos = { x: 0, y: 0 };
      let last: { x: number; y: number } | null = null;
      let tilt = 0;

      const set = (x: number, y: number) => {
        const vx = x - pos.x;
        pos.x = x;
        pos.y = y;
        el.style.transform = `translate3d(${x - 4}px, ${y - 2}px, 0)`;
        /* low-pass the lean so it eases in and out instead of twitching */
        tilt += (clamp(vx * 0.7, -14, 14) - tilt) * 0.3;
        arrow.style.transform = `rotate(${tilt}deg)`;
        if (!last) {
          last = { x, y };
        } else if (y < H && Math.hypot(x - last.x, y - last.y) > 8) {
          emitDust(x, y);
          last = { x, y };
        }
      };

      /* a soft "click": press in, settle with a tiny rebound */
      const click = () => {
        arrow.animate(
          { scale: ["1", "0.84", "1.05", "1"] },
          { duration: 340 / speed, easing: "ease-in-out" }
        );
      };

      /* curved, human-ish movement with a smootherstep velocity profile */
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

      return { el, set, moveTo, click, pos };
    };

    /* ---------- selection box: orbiting light, aurora glow ---------- */

    const makeBox = (x: number, y: number, name: string, chrome: boolean, radius: string) => {
      const el = mk("div", {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: "0px",
        height: "0px",
        boxSizing: "border-box",
        borderRadius: radius,
        zIndex: "1",
        pointerEvents: "none",
        transition: "opacity .6s",
      });

      const glow = mk("div", {
        position: "absolute",
        inset: "-6px",
        borderRadius: "inherit",
        background: grad(120),
        filter: "blur(18px)",
        opacity: "0",
        transition: "opacity .45s",
        zIndex: "-1",
      });

      const fill = mk("div", {
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        background: `linear-gradient(135deg, ${mixc(P0, 13)}, ${mixc(P1, 8)} 55%, ${mixc(P3, 11)})`,
        opacity: "0",
        transition: "opacity .35s",
      });
      requestAnimationFrame(() => (fill.style.opacity = "1"));

      /* gradient hairline border (masked ring) with a comet orbiting inside */
      const ring = mk("div", {
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        padding: "1.5px",
        boxSizing: "border-box",
        background: grad(135, 55),
        transition: "opacity .5s",
      });
      const maskImg = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
      ring.style.setProperty("-webkit-mask", maskImg);
      ring.style.setProperty("-webkit-mask-composite", "xor");
      ring.style.setProperty("mask", maskImg);
      ring.style.setProperty("mask-composite", "exclude");

      const spinner = mk("div", {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "8px",
        height: "8px",
        marginLeft: "-4px",
        marginTop: "-4px",
        background: comet,
        transition: "opacity .4s",
      });
      ring.appendChild(spinner);
      const spin = spinner.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 2000, iterations: Infinity, easing: "linear" }
      );

      const nameChip = pill(name, { dot: true });
      nameChip.el.style.opacity = "0";
      if (y < 30) {
        nameChip.el.style.left = "8px";
        nameChip.el.style.top = "8px";
      } else {
        nameChip.el.style.left = "0px";
        nameChip.el.style.top = "-26px";
      }

      const dim = pill("0 × 0", { mono: true });
      dim.el.style.left = "50%";
      dim.el.style.top = "100%";
      dim.el.style.transform = "translate(-50%, 8px)";

      el.append(fill, ring);
      if (chrome) {
        el.prepend(glow);
        el.append(nameChip.el, dim.el);
      }
      overlay.appendChild(el);

      /* let the orbiting comet slow to a stop instead of freezing mid-frame */
      const decelerate = () => {
        const t0 = performance.now();
        const D = 750;
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / D);
          spin.playbackRate = Math.max(0.0001, 1 - easeOut(t));
          if (t < 1) requestAnimationFrame(step);
          else spin.pause();
        };
        requestAnimationFrame(step);
      };

      return {
        el,
        setSize(w: number, h: number) {
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
          dim.text.textContent = `${Math.round(w)} × ${Math.round(h)}`;
          const d = Math.max(8, Math.hypot(w, h) + 6);
          spinner.style.width = `${d}px`;
          spinner.style.height = `${d}px`;
          spinner.style.marginLeft = `${-d / 2}px`;
          spinner.style.marginTop = `${-d / 2}px`;
        },
        select() {
          if (!chrome) return;
          nameChip.el.style.opacity = "1";
          glow.style.opacity = "0.5";
          el.animate(
            [
              { boxShadow: `0 0 0 0 ${mixc(P1, 50)}` },
              { boxShadow: `0 0 0 14px ${mixc(P1, 0)}` },
            ],
            { duration: 560 / speed, easing: "ease-out" }
          );
        },
        /* everything eases out together: the comet coasts to a stop while the
           glow, fill and chips dissolve on one soft curve */
        settle() {
          if (!chrome) {
            spin.cancel();
            el.style.opacity = "0";
            return;
          }
          decelerate();
          spinner.style.transition = `opacity .9s ${EASE_SOFT}`;
          spinner.style.opacity = "0";
          glow.style.transition = `opacity 1s ${EASE_SOFT}`;
          glow.style.opacity = "0";
          fill.style.transition = `opacity .8s ${EASE_SOFT}`;
          fill.style.opacity = "0";
          ring.style.transition = `opacity .9s ${EASE_SOFT}`;
          ring.style.opacity = "0.5";
          nameChip.el.style.transition = `opacity .5s ${EASE_SOFT}`;
          nameChip.el.style.opacity = "0";
          dim.el.style.transition = `opacity .5s ${EASE_SOFT}`;
          dim.el.style.opacity = "0";
          el.animate(
            [
              { boxShadow: `0 0 0 0 ${mixc(P1, 38)}` },
              { boxShadow: `0 0 0 18px ${mixc(P1, 0)}` },
            ],
            { duration: 900 / speed, easing: EASE_OUT_EXPO }
          );
        },
        fade() {
          el.style.transition = `opacity 1s ${EASE_SOFT}`;
          el.style.opacity = "0";
        },
      };
    };

    /* ---------- one full "design" pass ---------- */

    const runOnce = async (ctl: Ctl) => {
      const targets = collect(content, maxDepth, maxSteps ?? (selector ? 80 : 14), selector);
      targets.forEach((el) => {
        hidden.set(el, el === content ? "visible" : el.style.visibility);
        el.style.visibility = "hidden";
      });

      const W = root.getBoundingClientRect().width;
      const H = root.getBoundingClientRect().height;

      const cursor = makeCursor(H);
      overlay.appendChild(cursor.el);
      cursor.set(W * 0.8, H + 40);
      requestAnimationFrame(() => (cursor.el.style.opacity = "1"));

      const boxes: ReturnType<typeof makeBox>[] = [];
      await sleep(300 / speed, ctl);

      for (const el of targets) {
        const rr = root.getBoundingClientRect();
        const v = visibleRect(el, content);
        const x = v.left - rr.left;
        const y = v.top - rr.top;
        const w = v.width;
        const h = v.height;
        const kind: Kind =
          el === content
            ? "frame"
            : quickSelector && el.matches(quickSelector)
              ? "quick"
              : el.getAttribute("data-dc") === "card"
                ? "card"
                : "item";
        const P = PROFILE[kind];
        const name =
          el.getAttribute("data-dc-name") ?? (el === content ? "frame" : el.tagName.toLowerCase());
        const radius = radiusOf(el);

        /* bloom from the centre: the element opens like an iris and sharpens while a soft outline breathes out */
        const reveal = () => {
          el.style.visibility = hidden.get(el) ?? "";
          hidden.delete(el);
          if (kind === "frame") return;
          const dur = (kind === "quick" ? 300 : 820) / speed;
          el.animate(
            [
              {
                clipPath: `inset(50% 50% 50% 50% round ${radius})`,
                filter: "blur(12px) saturate(1.4)",
                opacity: 0,
              },
              { opacity: 1, filter: "blur(3px) saturate(1.15)", offset: 0.45 },
              { clipPath: "inset(-40px)", filter: "blur(0px) saturate(1)", opacity: 1 },
            ],
            { duration: dur, easing: EASE_OUT_EXPO }
          );
          if (kind !== "quick") breathe(x, y, w, h, radius, dur);
        };

        if (w < 4 || h < 4) {
          reveal();
          continue;
        }

        const travel = Math.hypot(x - cursor.pos.x, y - cursor.pos.y);
        await cursor.moveTo(
          x,
          y,
          (clamp(P.travel[0] + travel * 0.4, P.travel[0], P.travel[1]) * 1.1) / speed,
          ctl
        );

        if (P.chrome) {
          burst(x, y);
          cursor.click();
        }
        const box = makeBox(x, y, name, P.chrome, radius);
        boxes.push(box);

        const size = Math.sqrt(w * h);
        await tween(clamp(P.draw[0] + size * 0.8, P.draw[0], P.draw[1]) / speed, ctl, (t) => {
          const e = easeOut(t);
          box.setSize(w * e, h * e);
          cursor.set(x + w * e, y + h * e);
        });

        box.select();
        if (P.chrome) {
          burst(x + w, y + h);
          cursor.click();
        }
        await sleep(P.hold / speed, ctl);

        reveal();
        box.settle();
        await sleep(P.settle / speed, ctl);
      }

      await sleep(300 / speed, ctl);
      boxes.forEach((b) => b.fade());

      await cursor.moveTo(W * 0.85, H + 40, 550 / speed, ctl);
      cursor.el.style.opacity = "0";
      await sleep(1800 / speed, ctl);
      clearOverlay();
      restoreAll();
    };

    /* ---------- lifecycle ---------- */

    let ctl: Ctl | null = null;
    let played = false;

    const start = () => {
      if (ctl || (played && !loop && !replay)) return;
      const c: Ctl = { cancelled: false };
      ctl = c;
      (async () => {
        await sleep(startDelay, c);
        do {
          await runOnce(c);
          played = true;
          if (!loop) return;
          await sleep(loopDelay, c);
        } while (!c.cancelled);
      })()
        .catch((e) => {
          if (e !== CANCEL) console.error(e);
        })
        .finally(() => {
          if (ctl === c) ctl = null;
        });
    };

    const stop = () => {
      if (ctl) {
        ctl.cancelled = true;
        ctl = null;
      }
      clearOverlay();
      restoreAll();
      content.style.visibility = "hidden";
    };

    let io: IntersectionObserver | null = null;
    if (trigger === "inView" && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry.isIntersecting) {
            start();
          } else if (replay || !played) {
            stop();
          }
        },
        { threshold: 0.1 }
      );
      io.observe(root);
    } else {
      start();
    }

    return () => {
      io?.disconnect();
      stop();
    };
  }, [color, paletteKey, label, speed, loop, replay, loopDelay, startDelay, maxDepth, maxSteps, selector, quickSelector, trigger]);

  return (
    <div ref={rootRef} className={className} style={{ position: "relative", ...style }}>
      {/* Hidden from the very first paint so nothing flashes before the
          animation starts; the effect reveals it. No-JS users still see it. */}
      <noscript>
        <style>{`.dc-content{visibility:visible!important}`}</style>
      </noscript>
      <div ref={contentRef} className="dc-content" style={{ visibility: "hidden" }}>
        {children}
      </div>
      <div
        ref={overlayRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 50,
          overflow: "visible",
        }}
      />
    </div>
  );
};

export default DesignCursor;