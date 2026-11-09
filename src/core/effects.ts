import { EASE_OUT_EXPO } from "../const/constants";
import { clamp } from "../helpers/math";
import { maskedRing, mk } from "../helpers/dom";
import type { Ctx } from "./context";

export interface Effects {
  /** A few fine specks shed from the cursor tip. */
  emitDust: (x: number, y: number) => void;
  /** Click feedback at a point, per `effects.click`. */
  click: (x: number, y: number) => void;
  /** Soft outline that breathes out from an element as it appears. */
  outline: (x: number, y: number, w: number, h: number, radius: string, ms: number) => void;
}

export const createEffects = (ctx: Ctx): Effects => {
  const { overlay, cfg, theme, registry, particles, density } = ctx;
  const { palette, n } = theme;
  const speed = cfg.speed;
  const dustOn = cfg.effects.dust;

  const removeOnFinish = (anim: Animation, el: HTMLElement) =>
    anim.addEventListener("finish", () => el.remove(), { once: true });

  /* ---------- cursor dust ---------- */

  let dustIdx = 0;
  const emitDust = (x: number, y: number) => {
    if (!dustOn) return;
    if (density < 1 && Math.random() > density) return;
    const count = Math.random() < 0.25 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 24;
      const glint = Math.random() < 0.07;
      particles.mote(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, {
        dx: Math.cos(ang) * dist * 0.8,
        dy: Math.sin(ang) * dist * 0.8,
        g: 6 + Math.random() * 16,
        dur: (900 + Math.random() * 900) / speed,
        size: glint ? 6 + Math.random() * 3 : 0.9 + Math.pow(Math.random(), 2.2) * 2.2,
        color: Math.random() < 0.35 ? "#fff" : palette[dustIdx++ % n],
        alpha: glint ? 0.9 : 0.45 + Math.random() * 0.4,
        glint,
        wobble: 2 + Math.random() * 4,
      });
    }
  };

  /* ---------- click: plain ring (original) or ring + dust burst ---------- */

  const ringOnly = (x: number, y: number) => {
    const r = mk("div", {
      position: "absolute",
      left: `${x - 10}px`,
      top: `${y - 10}px`,
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      border: `2px solid ${theme.primary}`,
      pointerEvents: "none",
      zIndex: "2",
    });
    overlay.appendChild(r);
    const a = registry.track(
      r.animate(
        [
          { transform: "scale(.3)", opacity: 0.9 },
          { transform: "scale(1.7)", opacity: 0 },
        ],
        { duration: 450 / speed, easing: "ease-out" }
      )
    );
    removeOnFinish(a, r);
  };

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
      boxShadow: `0 0 14px ${theme.mix(c0, 45)}`,
      pointerEvents: "none",
      zIndex: "2",
    });
    overlay.appendChild(ring);
    const a = registry.track(
      ring.animate(
        [
          { transform: "scale(.3)", opacity: 0.8 },
          { transform: "scale(2.3)", opacity: 0 },
        ],
        { duration: 760 / speed, easing: EASE_OUT_EXPO }
      )
    );
    removeOnFinish(a, ring);

    const specks = Math.round(14 * density);
    for (let i = 0; i < specks; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 30;
      particles.mote(x, y, {
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
      particles.mote(x, y, {
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

  const click = (x: number, y: number) => {
    if (cfg.effects.click === "ring") ringOnly(x, y);
    else if (cfg.effects.click === "burst") burst(x, y);
  };

  /* ---------- reveal outline ---------- */

  const outline = (x: number, y: number, w: number, h: number, radius: string, ms: number) => {
    const mode = cfg.effects.revealOutline;
    if (mode === "none") return;

    const box = mk("div", {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      boxSizing: "border-box",
      borderRadius: radius,
      pointerEvents: "none",
      zIndex: "2",
      willChange: "transform, opacity",
    });

    if (mode === "solid") {
      box.style.border = `1px solid ${theme.mix(theme.primary, 70)}`;
      box.style.boxShadow = `0 0 16px ${theme.mix(theme.second, 28)}`;
    } else {
      /* gradient hairline + a blurred copy of it for the soft halo */
      const halo = mk("div", {
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        filter: "blur(6px)",
        opacity: "0.9",
      });
      halo.appendChild(maskedRing(theme.grad(135), 3));
      box.append(halo, maskedRing(theme.grad(135), 1.5));
    }

    overlay.appendChild(box);
    const a = registry.track(
      box.animate(
        [
          { transform: "scale(1)", opacity: 0 },
          { opacity: 0.85, offset: 0.25 },
          { transform: `scale(${1 + clamp(14 / Math.max(w, h), 0.012, 0.06)})`, opacity: 0 },
        ],
        { duration: ms * 1.4, easing: EASE_OUT_EXPO }
      )
    );
    removeOnFinish(a, box);
  };

  return { emitDust, click, outline };
};
