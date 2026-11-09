import { EASE_OUT_EXPO, EASE_SOFT } from "../const/constants";
import { easeOut } from "../helpers/math";
import { maskedRing, mk } from "../helpers/dom";
import type { Ctx } from "./context";
import { createTag } from "./label";

export interface BoxInit {
  x: number;
  y: number;
  /** Final size. Known up-front so size-dependent parts are set once, not per frame. */
  w: number;
  h: number;
  name: string;
  /** Full treatment (labels, glow, aura…). False for "quick" items. */
  chrome: boolean;
  /** CSS border-radius. */
  radius: string;
}

export interface Box {
  el: HTMLElement;
  setSize: (w: number, h: number) => void;
  /** The corner is reached: show tags, pulse. */
  select: () => void;
  /** The real element is revealed: wind the effects down. */
  settle: () => void;
  /** Dissolve the leftover outline. */
  fade: () => void;
}

export const createBox = (ctx: Ctx, init: BoxInit): Box => {
  const { cfg, theme: t, registry, overlay } = ctx;
  const o = cfg.box;
  const { x, y, w, h, name, chrome, radius } = init;
  const speed = cfg.speed;
  const gradientStyle = o.style === "gradient";
  const solidTag = cfg.tag.style === "solid";

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

  /* flat dashed style paints on the box itself */
  if (!gradientStyle) {
    el.style.border = `1.5px dashed ${t.primary}`;
    if (o.fill) el.style.background = t.mix(t.primary, 9);
    el.style.transition = "opacity .5s, background .4s, border-color .4s";
  }

  /* ---------- glow (static, blurred) ---------- */
  let glow: HTMLElement | null = null;
  if (chrome && o.glow) {
    glow = mk("div", {
      position: "absolute",
      inset: "-6px",
      borderRadius: "inherit",
      background: t.grad(120),
      filter: "blur(18px)",
      opacity: "0",
      transition: "opacity .45s",
      zIndex: "-1",
    });
    el.appendChild(glow);
  }

  /* ---------- breathing gradient aura ----------
     outer: fades in/out (CSS transition). inner: blurred ring that breathes
     (transform + opacity only, so it stays on the compositor). */
  let aura: HTMLElement | null = null;
  let breath: Animation | null = null;
  if (chrome && o.breathing) {
    aura = mk("div", {
      position: "absolute",
      inset: "-4px",
      borderRadius: "inherit",
      opacity: "0",
      transition: "opacity .45s",
      zIndex: "-1",
    });
    const inner = mk("div", {
      position: "absolute",
      inset: "0",
      borderRadius: "inherit",
      filter: "blur(5px)",
      willChange: "transform, opacity",
    });
    inner.appendChild(maskedRing(t.grad(135), 3));
    aura.appendChild(inner);
    el.appendChild(aura);
    breath = registry.track(
      inner.animate(
        [
          { transform: "scale(1)", opacity: 0.45 },
          { transform: `scale(${1 + Math.min(0.05, 16 / Math.max(w, h, 1))})`, opacity: 1 },
          { transform: "scale(1)", opacity: 0.45 },
        ],
        { duration: 1900, iterations: Infinity, easing: "ease-in-out" }
      )
    );
  }

  /* ---------- gradient fill ---------- */
  let fill: HTMLElement | null = null;
  if (gradientStyle && o.fill) {
    fill = mk("div", {
      position: "absolute",
      inset: "0",
      borderRadius: "inherit",
      background: `linear-gradient(135deg, ${t.mix(t.primary, 13)}, ${t.mix(t.second, 8)} 55%, ${t.mix(t.last, 11)})`,
      opacity: "0",
      transition: "opacity .35s",
    });
    el.appendChild(fill);
  }

  /* ---------- hairline ring (+ orbiting comet) ---------- */
  let ring: HTMLElement | null = null;
  let spinner: HTMLElement | null = null;
  let spin: Animation | null = null;
  if (gradientStyle || (chrome && o.orbit)) {
    ring = maskedRing(gradientStyle ? t.grad(135, 55) : "transparent", 1.5);
    ring.style.transition = "opacity .5s";
    if (chrome && o.orbit) {
      const d = Math.max(8, Math.hypot(w, h) + 6); // sized once from the final box
      spinner = mk("div", {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${d}px`,
        height: `${d}px`,
        marginLeft: `${-d / 2}px`,
        marginTop: `${-d / 2}px`,
        background: t.comet,
        transition: "opacity .4s",
        willChange: "transform",
      });
      ring.appendChild(spinner);
      spin = registry.track(
        spinner.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
          duration: 2000,
          iterations: Infinity,
          easing: "linear",
        })
      );
    }
    el.appendChild(ring);
  }

  /* ---------- corner handles ---------- */
  const handles: HTMLElement[] = [];
  if (chrome && o.handles !== "none") {
    for (const cx of [0, 1]) {
      for (const cy of [0, 1]) {
        const hd = mk("span", {
          position: "absolute",
          left: `${cx * 100}%`,
          top: `${cy * 100}%`,
          transform: "translate(-50%, -50%)",
          background: "#fff",
          boxSizing: "border-box",
          opacity: "0",
          transition: "opacity .2s",
        });
        if (o.handles === "square") {
          hd.style.width = "7px";
          hd.style.height = "7px";
          hd.style.border = `1.5px solid ${t.primary}`;
        } else {
          hd.style.width = "10px";
          hd.style.height = "10px";
          hd.style.borderRadius = "50%";
          hd.style.boxShadow = `0 0 0 2px ${t.palette[(cx * 2 + cy) % t.n]}, 0 4px 10px rgba(10,10,30,.28)`;
        }
        handles.push(hd);
        el.appendChild(hd);
      }
    }
  }

  /* ---------- tags ---------- */
  let nameChip: HTMLElement | null = null;
  let dim: HTMLElement | null = null;
  if (chrome && o.showName) {
    nameChip = createTag(ctx, name);
    nameChip.style.opacity = "0";
    const inside = solidTag ? 4 : 8;
    if (y < (solidTag ? 24 : 30)) {
      nameChip.style.left = `${inside}px`;
      nameChip.style.top = `${inside}px`;
    } else {
      nameChip.style.left = solidTag ? "-1px" : "0px";
      nameChip.style.top = solidTag ? "-22px" : "-26px";
    }
    el.appendChild(nameChip);
  }
  if (chrome && o.showSize) {
    dim = createTag(ctx, "0 × 0", true);
    dim.style.left = "50%";
    dim.style.top = "100%";
    dim.style.transform = `translate(-50%, ${solidTag ? 6 : 8}px)`;
    el.appendChild(dim);
  }

  overlay.appendChild(el);

  /* fade layers in on the next frame so their transitions run */
  requestAnimationFrame(() => {
    if (fill) fill.style.opacity = "1";
    if (aura) aura.style.opacity = "1";
  });

  /* ---------- helpers ---------- */

  /** Let the orbiting comet coast to a stop instead of freezing mid-frame. */
  const decelerate = () => {
    if (!spin) return;
    const a = spin;
    const t0 = performance.now();
    const D = 750;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / D);
      a.playbackRate = Math.max(0.0001, 1 - easeOut(p));
      if (p < 1) requestAnimationFrame(step);
      else a.pause();
    };
    requestAnimationFrame(step);
  };

  let lastW = -1;
  let lastH = -1;

  return {
    el,

    setSize(cw, ch) {
      el.style.width = `${cw}px`;
      el.style.height = `${ch}px`;
      if (dim) {
        const rw = Math.round(cw);
        const rh = Math.round(ch);
        if (rw !== lastW || rh !== lastH) {
          lastW = rw;
          lastH = rh;
          dim.textContent = `${rw} × ${rh}`;
        }
      }
    },

    select() {
      if (!chrome) return;
      if (nameChip) nameChip.style.opacity = "1";
      if (glow) glow.style.opacity = "0.5";
      handles.forEach((hd) => (hd.style.opacity = "1"));
      if (gradientStyle) {
        registry.track(
          el.animate(
            [
              { boxShadow: `0 0 0 0 ${t.mix(t.second, 50)}` },
              { boxShadow: `0 0 0 14px ${t.mix(t.second, 0)}` },
            ],
            { duration: 560 / speed, easing: "ease-out" }
          )
        );
      }
    },

    settle() {
      if (!chrome) {
        spin?.cancel();
        el.style.opacity = "0";
        return;
      }

      if (nameChip) {
        nameChip.style.transition = `opacity .5s ${EASE_SOFT}`;
        nameChip.style.opacity = "0";
      }
      if (dim) {
        dim.style.transition = `opacity .5s ${EASE_SOFT}`;
        dim.style.opacity = "0";
      }
      handles.forEach((hd) => (hd.style.opacity = "0"));

      /* aura: fade out, then stop its infinite animation so it costs nothing */
      if (aura && breath) {
        const b = breath;
        aura.style.transition = `opacity 1s ${EASE_SOFT}`;
        aura.style.opacity = "0";
        aura.addEventListener("transitionend", () => b.cancel(), { once: true });
      }

      if (gradientStyle) {
        decelerate();
        if (spinner) {
          spinner.style.transition = `opacity .9s ${EASE_SOFT}`;
          spinner.style.opacity = "0";
        }
        if (glow) {
          glow.style.transition = `opacity 1s ${EASE_SOFT}`;
          glow.style.opacity = "0";
        }
        if (fill) {
          fill.style.transition = `opacity .8s ${EASE_SOFT}`;
          fill.style.opacity = "0";
        }
        if (ring) {
          ring.style.transition = `opacity .9s ${EASE_SOFT}`;
          ring.style.opacity = "0.5";
        }
        registry.track(
          el.animate(
            [
              { boxShadow: `0 0 0 0 ${t.mix(t.second, 38)}` },
              { boxShadow: `0 0 0 18px ${t.mix(t.second, 0)}` },
            ],
            { duration: 900 / speed, easing: EASE_OUT_EXPO }
          )
        );
      } else {
        /* flat style: dashed box becomes a faint solid outline */
        decelerate();
        if (glow) glow.style.opacity = "0";
        el.style.background = "transparent";
        el.style.border = `1px solid ${t.mix(t.primary, 45)}`;
      }
    },

    fade() {
      el.style.transition = `opacity 1s ${EASE_SOFT}`;
      el.style.opacity = "0";
    },
  };
};
