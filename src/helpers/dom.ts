import { FALLBACK_RADIUS, SKIP_TAGS } from "../const/constants";
import type { El } from "../types/types";

/** Tiny element factory. */
export const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: Partial<CSSStyleDeclaration> = {}
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  Object.assign(e.style, css);
  return e;
};

/**
 * A hollow ring (border only) painted with any background. Done with a mask so the
 * ring can carry a gradient and follow border-radius.
 */
export const maskedRing = (background: string, thickness: number) => {
  const el = mk("div", {
    position: "absolute",
    inset: "0",
    borderRadius: "inherit",
    padding: `${thickness}px`,
    boxSizing: "border-box",
    background,
  });
  const mask = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
  el.style.setProperty("-webkit-mask", mask);
  el.style.setProperty("-webkit-mask-composite", "xor");
  el.style.setProperty("mask", mask);
  el.style.setProperty("mask-composite", "exclude");
  return el;
};

/** The elements we will "design", in document order. Reads layout; call before any writes. */
export const collect = (
  root: HTMLElement,
  maxDepth: number,
  maxSteps: number,
  selector?: string
): El[] => {
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

  const walk = (parent: Element, depth: number) => {
    if (depth > maxDepth || out.length >= maxSteps) return;
    for (const child of Array.from(parent.children)) {
      if (out.length >= maxSteps) return;
      if (!(child instanceof HTMLElement || child instanceof SVGSVGElement)) continue;
      if (SKIP_TAGS.has(child.tagName.toLowerCase())) continue;
      if (getComputedStyle(child).display === "none") continue;
      const r = child.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      out.push(child);
      if (!(child instanceof SVGSVGElement)) walk(child, depth + 1);
    }
  };

  walk(root, 1);
  return out.slice(0, maxSteps);
};

/**
 * Element rect clipped by any overflow-hidden ancestor, so a globe that spills out of
 * its card is drawn only where it is actually visible. Viewport coordinates.
 */
export const visibleRect = (el: El, stop: Element) => {
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

/** The element's own corner radius, so boxes hug its shape. */
export const radiusOf = (el: El) => {
  const r = getComputedStyle(el).borderRadius;
  return !r || r === "0px" ? FALLBACK_RADIUS : r;
};
