/** Keeps track of every running Web Animation so a run can be torn down in one call. */
export interface Registry {
  track: (anim: Animation) => Animation;
  cancelAll: () => void;
}

export const createRegistry = (): Registry => {
  const live = new Set<Animation>();

  const track = (anim: Animation) => {
    live.add(anim);
    const done = () => live.delete(anim);
    anim.addEventListener("finish", done, { once: true });
    anim.addEventListener("cancel", done, { once: true });
    return anim;
  };

  const cancelAll = () => {
    // copy first: cancelling fires "cancel" listeners that mutate the set
    Array.from(live).forEach((a) => a.cancel());
    live.clear();
  };

  return { track, cancelAll };
};
