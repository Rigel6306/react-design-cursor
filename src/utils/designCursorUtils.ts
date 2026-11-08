import { El,Ctl } from "../types/designTypes";
import { CANCEL } from "../const/constents";


export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** smootherstep: zero velocity AND acceleration at both ends, so motion feels hand-guided */
export const easeInOut = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export const sleep = (ms: number, ctl: Ctl) =>
  new Promise<void>((resolve, reject) => {
    setTimeout(() => (ctl.cancelled ? reject(CANCEL) : resolve()), ms);
  });

  export const tween = (ms: number, ctl: Ctl, fn: (t: number) => void) =>
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



  export const collect=(
  root: HTMLElement,
  maxDepth: number,
  maxSteps: number,
  selector?: string
): El[] =>{
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