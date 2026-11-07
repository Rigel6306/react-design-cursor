

import React, { useEffect, useRef } from "react";

export interface DesignCursorProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Cursor + wireframe colour (any CSS colour). */
  color?: string;
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
const PROFILE: Record <Kind,{ travel: [number, number]; draw: [number, number]; hold: number; settle: number; chrome: boolean }> = {
  frame: { travel: [220, 420], draw: [480, 720], hold: 80, settle: 100, chrome: true },
  card: { travel: [190, 360], draw: [250, 420], hold: 40, settle: 60, chrome: true },
  item: { travel: [95, 200], draw: [120, 220], hold: 0, settle: 40, chrome: true },
  quick: { travel: [40, 70], draw: [50, 80], hold: 0, settle: 20, chrome: false },
};

/** Element rect clipped by any overflow-hidden ancestor (so a globe that
 *  spills out of its card is drawn only where it is actually visible). */
const visibleRect=(el: El, stop: Element)=> {
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
}

export const DesignCursor=({
  children,
  className,
  style,
  color = "#7c5cff",
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
}: DesignCursorProps)=> {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const overlay = overlayRef.current;
    if (!root || !content || !overlay) return;
    /* Content starts hidden (inline style) so nothing flashes before the
       animation begins. Reduced motion: just show it. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      content.style.visibility = "visible";
      return;
    }

    /* original inline `visibility` of every element we hide */
    const hidden = new Map<El, string>();
    const restoreAll = () => {
      hidden.forEach((v, el) => {
        el.style.visibility = v;
      });
      hidden.clear();
    };
    const clearOverlay = () => overlay.replaceChildren();

    /* ---------- tiny DOM helpers ---------- */

    const chip = (text: string) => {
      const s = document.createElement("span");
      s.textContent = text;
      Object.assign(s.style, {
        position: "absolute",
        background: color,
        color: "#fff",
        font: "600 11px/1 system-ui, -apple-system, Segoe UI, sans-serif",
        padding: "3px 6px",
        borderRadius: "4px",
        whiteSpace: "nowrap",
        transition: "opacity .2s",
      } as Partial<CSSStyleDeclaration>);
      return s;
    };

    const pulse = (x: number, y: number) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "absolute",
        left: `${x - 10}px`,
        top: `${y - 10}px`,
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        border: `2px solid ${color}`,
        pointerEvents: "none",
      } as Partial<CSSStyleDeclaration>);
      overlay.appendChild(r);
      const a = r.animate(
        [
          { transform: "scale(.3)", opacity: 0.9 },
          { transform: "scale(1.7)", opacity: 0 },
        ],
        { duration: 450, easing: "ease-out" }
      );
      a.onfinish = () => r.remove();
    };

    const makeCursor = () => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        left: "0",
        top: "0",
        zIndex: "3",
        opacity: "0",
        transition: "opacity .3s",
        willChange: "transform",
      } as Partial<CSSStyleDeclaration>);
      el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))"><path d="M4 2.5l15 8.2-6.6 1.9-2.4 6.9L4 2.5z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
      const tag = chip(label);
      tag.style.left = "14px";
      tag.style.top = "20px";
      el.appendChild(tag);

      const pos = { x: 0, y: 0 };
      const set = (x: number, y: number) => {
        pos.x = x;
        pos.y = y;
        el.style.transform = `translate3d(${x - 4}px, ${y - 2}px, 0)`;
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

      return { el, set, moveTo, pos };
    };

    const makeBox = (x: number, y: number, name: string, chrome: boolean) => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        width: "0px",
        height: "0px",
        boxSizing: "border-box",
        border: `1.5px dashed ${color}`,
        background: `color-mix(in srgb, ${color} 9%, transparent)`,
        transition: "opacity .5s, background .4s, border-color .4s",
        zIndex: "1",
      } as Partial<CSSStyleDeclaration>);

      const nameChip = chip(name);
      nameChip.style.opacity = "0";
      if (y < 24) {
        nameChip.style.left = "4px";
        nameChip.style.top = "4px";
      } else {
        nameChip.style.left = "-1px";
        nameChip.style.top = "-22px";
      }

      const dim = chip("0 × 0");
      dim.style.left = "50%";
      dim.style.top = "100%";
      dim.style.transform = "translate(-50%, 6px)";

      const handles = [0, 1].flatMap((cx) =>
        [0, 1].map((cy) => {
          const h = document.createElement("span");
          Object.assign(h.style, {
            position: "absolute",
            left: `${cx * 100}%`,
            top: `${cy * 100}%`,
            width: "7px",
            height: "7px",
            transform: "translate(-50%, -50%)",
            background: "#fff",
            border: `1.5px solid ${color}`,
            boxSizing: "border-box",
            opacity: "0",
            transition: "opacity .2s",
          } as Partial<CSSStyleDeclaration>);
          return h;
        })
      );

      if (chrome) el.append(nameChip, dim, ...handles);
      overlay.appendChild(el);

      return {
        el,
        setSize(w: number, h: number) {
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
          dim.textContent = `${Math.round(w)} × ${Math.round(h)}`;
        },
        select() {
          nameChip.style.opacity = "1";
          handles.forEach((h) => (h.style.opacity = "1"));
        },
        settle() {
          if (!chrome) {
            el.style.opacity = "0";
            return;
          }
          nameChip.style.opacity = "0";
          dim.style.opacity = "0";
          handles.forEach((h) => (h.style.opacity = "0"));
          el.style.background = "transparent";
          el.style.border = `1px solid color-mix(in srgb, ${color} 45%, transparent)`;
        },
      };
    };

    /* ---------- one full "design" pass ---------- */

    const runOnce = async (ctl: Ctl) => {
      const targets = collect(content, maxDepth, maxSteps ?? (selector ? 80 : 14), selector);
      targets.forEach((el) => {
        /* the content root starts hidden via React's inline style; once
           revealed it should simply inherit (visible) */
        hidden.set(el, el === content ? "visible" : el.style.visibility);
        el.style.visibility = "hidden";
      });

      const W = root.getBoundingClientRect().width;
      const H = root.getBoundingClientRect().height;

      const cursor = makeCursor();
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

        const reveal = () => {
          el.style.visibility = hidden.get(el) ?? "";
          hidden.delete(el);
          if (kind !== "frame") {
            el.animate({ opacity: [0, 1] }, { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" });
          }
        };

        /* fully clipped away: just show it */
        if (w < 4 || h < 4) {
          reveal();
          continue;
        }

        const travel = Math.hypot(x - cursor.pos.x, y - cursor.pos.y);
        await cursor.moveTo(x, y, clamp(P.travel[0] + travel * 0.4, P.travel[0], P.travel[1]) / speed, ctl);

        if (P.chrome) pulse(x, y);
        const box = makeBox(x, y, name, P.chrome);
        boxes.push(box);

        const size = Math.sqrt(w * h);
        await tween(clamp(P.draw[0] + size * 0.8, P.draw[0], P.draw[1]) / speed, ctl, (t) => {
          const e = easeOut(t);
          box.setSize(w * e, h * e);
          cursor.set(x + w * e, y + h * e);
        });

        box.select();
        if (P.chrome) pulse(x + w, y + h);
        await sleep(P.hold / speed, ctl);

        /* reveal the real element */
        reveal();
        box.settle();
        await sleep(P.settle / speed, ctl);
      }

      /* wrap up: fade wireframes, cursor leaves */
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

    /* Cancel any run and put everything back in the pre-animation state
       (hidden), ready to play again. */
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
            stop(); /* hide again so it replays on the way back */
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
  }, [color, label, speed, loop, replay, loopDelay, startDelay, maxDepth, maxSteps, selector, quickSelector, trigger]);

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
}

export default DesignCursor;