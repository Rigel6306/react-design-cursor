export const CANCEL = Symbol("cancel");
import { Kind } from "../types/designTypes";
export const PROFILE: Record<
  Kind,
  { travel: [number, number]; draw: [number, number]; hold: number; settle: number; chrome: boolean }
> = {
  frame: { travel: [220, 420], draw: [480, 720], hold: 80, settle: 100, chrome: true },
  card: { travel: [190, 360], draw: [250, 420], hold: 40, settle: 60, chrome: true },
  item: { travel: [95, 200], draw: [120, 220], hold: 0, settle: 40, chrome: true },
  quick: { travel: [40, 70], draw: [50, 80], hold: 0, settle: 20, chrome: false },
};
