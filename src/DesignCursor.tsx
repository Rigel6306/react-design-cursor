import React, { useEffect, useRef } from "react";

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

type El = HTMLElement | SVGElement;
type Ctl = { cancelled: boolean };

const CANCEL = Symbol("cancel");

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const sleep = (ms: number, ctl: Ctl) =>
  new Promise<void>((resolve, reject) => {
    setTimeout(() => (ctl.cancelled ? reject(CANCEL) : resolve()), ms);
  });

const tween = (ms: number, ctl: Ctl, fn: (t: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const t0 = performance.now();
    const frame = (now: number) => {
      if (ctl.cancelled) {
        reject(CANCEL);
        return;
      }
      const t = Math.min(1, (now - t0) / Math.max(1, ms));
      fn(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });

/** Collect the elements we will "design", in document order. */
function collect(
  root: HTMLElement,
  maxDepth: number,
  maxSteps: number,
  selector?: string
): El[] {
  const out: El[] = [root];

  if (selector) {
    root.querySelectorAll<El>(selector).forEach((el) => {
      if (el === root) return;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      out.push(el);
    });
    return out.slice(0, maxSteps);
  }

  const SKIP = new Set(["script", "style", "br", "wbr", "template", "noscript"]);

  const walk = (parent: Element, depth: number) => {
    if (depth > maxDepth) return;
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement || child instanceof SVGSVGElement)) continue;
      if (SKIP.has(child.tagName.toLowerCase())) continue;
      if (getComputedStyle(child).display === "none") continue;
      const r = child.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      out.push(child);
      if (!(child instanceof SVGSVGElement)) walk(child, depth + 1);
    }
  };

  walk(root, 1);
  return out.slice(0, maxSteps);
}

type Kind = "frame" | "card" | "item" | "quick";

/** Timing per kind, in ms: [min, max] for cursor travel and for the drag. */
const PROFILE: Record<
  Kind,
  { travel: [number, number]; draw: [number, number]; hold: number; settle: number; chrome: boolean }
> = {
  frame: { travel: [220, 420], draw: [480, 720], hold: 80, settle: 100, chrome: true },
  card: { travel: [190, 360], draw: [250, 420], hold: 40, settle: 60, chrome: true },
  item: { travel: [95, 200], draw: [120, 220], hold: 0, settle: 40, chrome: true },
  quick: { travel: [40, 70], draw: [50, 80], hold: 0, settle: 20, chrome: false },
};

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
    const clearOverlay = () => overlay.replaceChildren();

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
    const EASE_SPRING = "cubic-bezier(.34,1.56,.64,1)";

    /* ---------- frosted pill with a gradient edge ---------- */

    const pill = (text: string, o: { dot?: boolean; mono?: boolean } = {}) => {
      const el = mk("span", {
        position: "absolute",
        padding: "1px",
        borderRadius: "999px",
        background: grad(120),
        boxShadow: `0 8px 22px ${mixc(P0, 38)}`,
        whiteSpace: "nowrap",
        transition: "opacity .25s",
        pointerEvents: "none",
      });
      const inner = mk("span", {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: o.dot ? "5px 10px 5px 8px" : "5px 9px",
        borderRadius: "999px",
        background: "rgba(14,14,26,.84)",
        color: "#fff",
        font: o.mono
          ? "500 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace"
          : "600 11.5px/1 system-ui, -apple-system, Segoe UI, sans-serif",
        letterSpacing: ".02em",
      });
      inner.style.setProperty("backdrop-filter", "blur(10px)");
      inner.style.setProperty("-webkit-backdrop-filter", "blur(10px)");
      if (o.dot) {
        inner.appendChild(
          mk("span", {
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: conicFull,
            boxShadow: `0 0 8px ${mixc(P1, 80)}`,
          })
        );
      }
      const t = mk("span");
      t.textContent = text;
      inner.appendChild(t);
      el.appendChild(inner);
      return { el, text: t };
    };

    /* ---------- effects ---------- */

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
        border: `2px solid ${c0}`,
        boxShadow: `0 0 16px ${mixc(c0, 65)}, inset 0 0 10px ${mixc(c0, 35)}`,
        pointerEvents: "none",
        zIndex: "2",
      });
      overlay.appendChild(ring);
      const ra = ring.animate(
        [
          { transform: "scale(.25)", opacity: 0.95 },
          { transform: "scale(2.4)", opacity: 0 },
        ],
        { duration: 560 / speed, easing: "ease-out" }
      );
      ra.onfinish = () => ring.remove();

      const count = 7;
      const offset = Math.random() * Math.PI;
      for (let i = 0; i < count; i++) {
        const c = palette[(i + burstIdx) % n];
        const ang = offset + (i * Math.PI * 2) / count;
        const d = 20 + Math.random() * 18;
        const s = 3 + Math.random() * 3;
        const dot = mk("div", {
          position: "absolute",
          left: `${x - s / 2}px`,
          top: `${y - s / 2}px`,
          width: `${s}px`,
          height: `${s}px`,
          borderRadius: "50%",
          background: c,
          boxShadow: `0 0 8px 1px ${mixc(c, 80)}`,
          pointerEvents: "none",
          zIndex: "2",
        });
        overlay.appendChild(dot);
        const a = dot.animate(
          [
            { transform: "translate(0,0) scale(1)", opacity: 1 },
            { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px) scale(0)`, opacity: 0 },
          ],
          { duration: (480 + Math.random() * 220) / speed, easing: "cubic-bezier(.2,.7,.2,1)" }
        );
        a.onfinish = () => dot.remove();
      }
    };

    /* soft multicolour stardust left behind the cursor */
    let dustIdx = 0;
    const stardust = (x: number, y: number) => {
      const c = palette[dustIdx++ % n];
      const s = 4 + Math.random() * 3;
      const d = mk("div", {
        position: "absolute",
        left: `${x - s / 2}px`,
        top: `${y - s / 2}px`,
        width: `${s}px`,
        height: `${s}px`,
        borderRadius: "50%",
        background: c,
        boxShadow: `0 0 8px 1px ${mixc(c, 80)}`,
        pointerEvents: "none",
        zIndex: "2",
      });
      overlay.appendChild(d);
      const dx = (Math.random() - 0.5) * 16;
      const dy = 4 + Math.random() * 10;
      const a = d.animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 0.95 },
          { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 350, easing: "ease-out" }
      );
      a.onfinish = () => d.remove();
    };

    /* a diagonal sheen that glides across the freshly revealed element */
    const shine = (x: number, y: number, w: number, h: number, radius: string, ms: number) => {
      const wrap = mk("div", {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        overflow: "hidden",
        borderRadius: radius,
        pointerEvents: "none",
        zIndex: "2",
      });
      const streak = mk("div", {
        position: "absolute",
        inset: "0",
        background: `linear-gradient(105deg, transparent 34%, rgba(255,255,255,.5) 47%, ${mixc(P1, 45)} 52%, transparent 66%)`,
      });
      wrap.appendChild(streak);
      overlay.appendChild(wrap);
      const a = streak.animate(
        [{ transform: "translateX(-105%)" }, { transform: "translateX(105%)" }],
        { duration: ms * 1.15, easing: "ease-in-out" }
      );
      a.onfinish = () => wrap.remove();
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
        transition: "transform .12s linear",
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

      const set = (x: number, y: number) => {
        const vx = x - pos.x;
        pos.x = x;
        pos.y = y;
        el.style.transform = `translate3d(${x - 4}px, ${y - 2}px, 0)`;
        arrow.style.transform = `rotate(${clamp(vx * 0.7, -14, 14)}deg)`;
        if (!last) {
          last = { x, y };
        } else if (Math.hypot(x - last.x, y - last.y) > 11 && y < H) {
          stardust(x, y);
          last = { x, y };
        }
      };

      /* a little "click" squish */
      const click = () => {
        arrow.animate({ scale: ["1", "0.8", "1"] }, { duration: 240 / speed, easing: "ease-out" });
      };

      /* curved, human-ish movement */
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

    /* ---------- selection box: orbiting light, aurora glow, round handles ---------- */

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
        nameChip.el.style.top = "-32px";
      }

      const dim = pill("0 × 0", { mono: true });
      dim.el.style.left = "50%";
      dim.el.style.top = "100%";
      dim.el.style.transform = "translate(-50%, 12px)";

      const handles = [0, 1].flatMap((cx) =>
        [0, 1].map((cy) => {
          const c = palette[(cx * 2 + cy) % n];
          return mk("span", {
            position: "absolute",
            left: `${cx * 100}%`,
            top: `${cy * 100}%`,
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: `0 0 0 2px ${c}, 0 4px 10px rgba(10,10,30,.28)`,
            transform: "translate(-50%, -50%) scale(0)",
            opacity: "0",
            transition: "opacity .25s",
          });
        })
      );

      el.append(fill, ring);
      if (chrome) {
        el.prepend(glow);
        el.append(...handles, nameChip.el, dim.el);
      }
      overlay.appendChild(el);

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
          handles.forEach((h, i) => {
            h.style.opacity = "1";
            h.style.transform = "translate(-50%, -50%) scale(1)";
            h.animate(
              [
                { transform: "translate(-50%, -50%) scale(0)" },
                { transform: "translate(-50%, -50%) scale(1)" },
              ],
              { duration: 380 / speed, delay: (i * 45) / speed, easing: EASE_SPRING, fill: "backwards" }
            );
          });
          el.animate(
            [
              { boxShadow: `0 0 0 0 ${mixc(P1, 50)}` },
              { boxShadow: `0 0 0 14px ${mixc(P1, 0)}` },
            ],
            { duration: 560 / speed, easing: "ease-out" }
          );
        },
        settle() {
          spin.cancel();
          if (!chrome) {
            el.style.opacity = "0";
            return;
          }
          spinner.style.opacity = "0";
          glow.style.opacity = "0";
          fill.style.opacity = "0";
          ring.style.opacity = "0.6";
          nameChip.el.style.opacity = "0";
          dim.el.style.opacity = "0";
          handles.forEach((h) => (h.style.opacity = "0"));
          el.animate(
            [
              { boxShadow: `0 0 0 0 ${mixc(P1, 45)}` },
              { boxShadow: `0 0 0 10px ${mixc(P1, 0)}` },
            ],
            { duration: 480 / speed, easing: "ease-out" }
          );
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

        /* bloom from the centre: the element opens like an iris, then a sheen glides over it */
        const reveal = () => {
          el.style.visibility = hidden.get(el) ?? "";
          hidden.delete(el);
          if (kind === "frame") return;
          const dur = (kind === "quick" ? 280 : 680) / speed;
          el.animate(
            [
              {
                clipPath: `inset(50% 50% 50% 50% round ${radius})`,
                filter: "blur(10px) saturate(1.6)",
                opacity: 0,
              },
              { clipPath: "inset(-40px)", filter: "blur(0px) saturate(1)", opacity: 1 },
            ],
            { duration: dur, easing: EASE_OUT_EXPO }
          );
          if (kind !== "quick") shine(x, y, w, h, radius, dur);
        };

        if (w < 4 || h < 4) {
          reveal();
          continue;
        }

        const travel = Math.hypot(x - cursor.pos.x, y - cursor.pos.y);
        await cursor.moveTo(x, y, clamp(P.travel[0] + travel * 0.4, P.travel[0], P.travel[1]) / speed, ctl);

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
      boxes.forEach((b) => (b.el.style.opacity = "0"));
      await cursor.moveTo(W * 0.85, H + 40, 550 / speed, ctl);
      cursor.el.style.opacity = "0";
      await sleep(400, ctl);
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