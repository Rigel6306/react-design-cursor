import type { Theme } from "../helpers/theme";
import type { ResolvedConfig } from "../types/types";
import type { Particles } from "./particles";
import type { Registry } from "./registry";

/** Everything the core builders need, created once per component instance. */
export interface Ctx {
  overlay: HTMLElement;
  cfg: ResolvedConfig;
  theme: Theme;
  registry: Registry;
  particles: Particles;
  /** 0–1 multiplier applied to dust counts. */
  density: number;
}
