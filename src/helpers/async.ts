/** Thrown (rejected) by sleep/tween when their run is cancelled. */
export const CANCEL = Symbol("cancel");

/** Cancellation handle for one run. Cancelling aborts every pending sleep/tween at once. */
export interface Ctl {
  cancelled: boolean;
  aborts: Set<() => void>;
  cancel(): void;
}

export const createCtl = (): Ctl => {
  const aborts = new Set<() => void>();
  return {
    cancelled: false,
    aborts,
    cancel() {
      this.cancelled = true;
      aborts.forEach((fn) => fn());
      aborts.clear();
    },
  };
};

/** Resolves after `ms`; rejects with CANCEL immediately if the run is cancelled. */
export const sleep = (ms: number, ctl: Ctl) =>
  new Promise<void>((resolve, reject) => {
    if (ctl.cancelled) return reject(CANCEL);
    const abort = () => {
      clearTimeout(id);
      reject(CANCEL);
    };
    const id = setTimeout(() => {
      ctl.aborts.delete(abort);
      resolve();
    }, ms);
    ctl.aborts.add(abort);
  });

/** rAF-driven 0→1 progress callback. Rejects with CANCEL if the run is cancelled. */
export const tween = (ms: number, ctl: Ctl, fn: (t: number) => void) =>
  new Promise<void>((resolve, reject) => {
    if (ctl.cancelled) return reject(CANCEL);
    let raf = 0;
    const abort = () => {
      cancelAnimationFrame(raf);
      reject(CANCEL);
    };
    ctl.aborts.add(abort);
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / Math.max(1, ms)));
      fn(t);
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        ctl.aborts.delete(abort);
        resolve();
      }
    };
    raf = requestAnimationFrame(frame);
  });
