import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_STEPS_WITH_SELECTOR,
  EASE_OUT_EXPO,
  PROFILE,
  REVEAL_MS,
} from "../const/constants";
import { CANCEL, createCtl, sleep, tween, type Ctl } from "../helpers/async";
import { collect, radiusOf, visibleRect } from "../helpers/dom";
import { clamp, easeOut } from "../helpers/math";
import { createTheme } from "../helpers/theme";
import type { El, Kind, ResolvedConfig } from "../types/types";
import { createBox, type Box } from "./box";
import type { Ctx } from "./context";
import { createCursor } from "./cursor";
import { createEffects } from "./effects";
import { createParticles } from "./particles";
import { createRegistry } from "./registry";

export interface RunnerArgs {
  root: HTMLElement;
  content: HTMLElement;
  overlay: HTMLElement;
  cfg: ResolvedConfig;
  onComplete?: () => void;
}

export interface Runner {
  destroy: () => void;
}

/** One element's plan, measured up-front so no layout is read while animating. */
interface Step {
  el: El;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  radius: string;
}

export const createRunner = ({ root, content, overlay, cfg, onComplete }: RunnerArgs): Runner => {
  const { speed } = cfg;

  /* ---------- shared context ---------- */
  const registry = createRegistry();
  const particles = createParticles(overlay, registry, cfg.perf.maxParticles);
  const theme = createTheme(cfg.palette);
  const density =
    cfg.perf.particleDensity === "auto"
      ? (navigator.hardwareConcurrency ?? 8) <= 4
        ? 0.6
        : 1
      : clamp(cfg.perf.particleDensity, 0, 1);
  const ctx: Ctx = { overlay, cfg, theme, registry, particles, density };
  const effects = createEffects(ctx);

  /* ---------- hide / restore the real elements ---------- */
  const hidden = new Map<El, string>();
  const restoreAll = () => {
    hidden.forEach((v, el) => {
      el.style.visibility = v;
    });
    hidden.clear();
  };

  const clearOverlay = () => {
    registry.cancelAll();
    particles.reset();
    overlay.replaceChildren();
  };

  /* ---------- reveal ---------- */
  const reveal = (s: Step) => {
    s.el.style.visibility = hidden.get(s.el) ?? "";
    hidden.delete(s.el);
    if (s.kind === "frame") return;

    const mode = cfg.effects.reveal;
    const quick = s.kind === "quick";

    if (mode === "fade") {
      registry.track(
        s.el.animate({ opacity: [0, 1] }, { duration: REVEAL_MS.fade / speed, easing: EASE_OUT_EXPO })
      );
    } else if (mode === "iris") {
      const dur = (quick ? REVEAL_MS.irisQuick : REVEAL_MS.iris) / speed;
      /* blur is the expensive part on big elements: only use it on smaller ones */
      const blur = s.w * s.h <= cfg.perf.irisBlurMaxArea;
      const frames: Keyframe[] = blur
        ? [
            { clipPath: `inset(50% 50% 50% 50% round ${s.radius})`, filter: "blur(12px) saturate(1.4)", opacity: 0 },
            { opacity: 1, filter: "blur(3px) saturate(1.15)", offset: 0.45 },
            { clipPath: "inset(-40px)", filter: "blur(0px) saturate(1)", opacity: 1 },
          ]
        : [
            { clipPath: `inset(50% 50% 50% 50% round ${s.radius})`, opacity: 0 },
            { opacity: 1, offset: 0.45 },
            { clipPath: "inset(-40px)", opacity: 1 },
          ];
      registry.track(s.el.animate(frames, { duration: dur, easing: EASE_OUT_EXPO }));
    }

    if (!quick) effects.outline(s.x, s.y, s.w, s.h, s.radius, REVEAL_MS.iris / speed);
  };

  /* ---------- one full pass ---------- */
  const runOnce = async (ctl: Ctl) => {
    const targets = collect(
      content,
      cfg.maxDepth,
      cfg.maxSteps ?? (cfg.selector ? DEFAULT_MAX_STEPS_WITH_SELECTOR : DEFAULT_MAX_STEPS),
      cfg.selector
    );

    /* READ phase: measure everything once, before touching the DOM */
    const rr = root.getBoundingClientRect();
    const W = rr.width;
    const H = rr.height;
    const steps: Step[] = targets.map((el) => {
      const v = visibleRect(el, content);
      const kind: Kind =
        el === content
          ? "frame"
          : cfg.quickSelector && el.matches(cfg.quickSelector)
            ? "quick"
            : el.getAttribute("data-dc") === "card"
              ? "card"
              : "item";
      return {
        el,
        kind,
        x: v.left - rr.left,
        y: v.top - rr.top,
        w: v.width,
        h: v.height,
        name: el.getAttribute("data-dc-name") ?? (el === content ? "frame" : el.tagName.toLowerCase()),
        radius: cfg.box.radius === "match" ? radiusOf(el) : `${cfg.box.radius}px`,
      };
    });

    /* WRITE phase */
    steps.forEach((s) => {
      hidden.set(s.el, s.el === content ? "visible" : s.el.style.visibility);
      s.el.style.visibility = "hidden";
    });

    const cursor = createCursor(ctx, effects, H);
    overlay.appendChild(cursor.el);
    cursor.set(W * 0.8, H + 40);
    requestAnimationFrame(cursor.show);

    const boxes: Box[] = [];
    await sleep(300 / speed, ctl);

    for (const s of steps) {
      const P = PROFILE[s.kind];

      /* fully clipped away: just show it */
      if (s.w < 4 || s.h < 4) {
        reveal(s);
        continue;
      }

      const travel = Math.hypot(s.x - cursor.pos.x, s.y - cursor.pos.y);
      await cursor.moveTo(
        s.x,
        s.y,
        (clamp(P.travel[0] + travel * 0.4, P.travel[0], P.travel[1]) * 1.1) / speed,
        ctl
      );

      if (P.chrome) {
        effects.click(s.x, s.y);
        cursor.click();
      }

      const box = createBox(ctx, {
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        name: s.name,
        chrome: P.chrome,
        radius: s.radius,
      });
      boxes.push(box);

      const size = Math.sqrt(s.w * s.h);
      await tween(clamp(P.draw[0] + size * 0.8, P.draw[0], P.draw[1]) / speed, ctl, (t) => {
        const e = easeOut(t);
        box.setSize(s.w * e, s.h * e);
        cursor.set(s.x + s.w * e, s.y + s.h * e);
      });

      box.select();
      if (P.chrome) {
        effects.click(s.x + s.w, s.y + s.h);
        cursor.click();
      }
      await sleep(P.hold / speed, ctl);

      reveal(s);
      box.settle();
      await sleep(P.settle / speed, ctl);
    }

    /* wrap up: fade wireframes, cursor leaves */
    await sleep(300 / speed, ctl);
    boxes.forEach((b) => b.fade());
    await cursor.moveTo(W * 0.85, H + 40, 550 / speed, ctl);
    cursor.hide();
    /* leave time for any dust still drifting */
    const tail = cfg.effects.dust || cfg.effects.click === "burst" ? 1800 : 400;
    await sleep(tail / speed, ctl);

    clearOverlay();
    restoreAll();
    onComplete?.();
  };

  /* ---------- lifecycle ---------- */
  let ctl: Ctl | null = null;
  let played = false;

  const start = () => {
    if (ctl || (played && !cfg.loop && !cfg.replay)) return;
    const c = createCtl();
    ctl = c;
    (async () => {
      await sleep(cfg.startDelay, c);
      do {
        await runOnce(c);
        played = true;
        if (!cfg.loop) return;
        await sleep(cfg.loopDelay, c);
      } while (!c.cancelled);
    })()
      .catch((e) => {
        if (e !== CANCEL) console.error(e);
      })
      .finally(() => {
        if (ctl === c) ctl = null;
      });
  };

  /** Cancel any run and return to the pre-animation (hidden) state, ready to replay. */
  const stop = () => {
    if (ctl) {
      ctl.cancel();
      ctl = null;
    }
    clearOverlay();
    restoreAll();
    content.style.visibility = "hidden";
  };

  let io: IntersectionObserver | null = null;
  if (cfg.trigger === "inView" && "IntersectionObserver" in window) {
    io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry.isIntersecting) start();
        else if (cfg.replay || !played) stop(); // hide again so it replays on the way back
      },
      { threshold: 0.1 }
    );
    io.observe(root);
  } else {
    start();
  }

  return {
    destroy() {
      io?.disconnect();
      stop();
    },
  };
};
