import { mk } from "../helpers/dom";
import type { Ctx } from "./context";

/** Minimal text label used for the cursor name, box names and size readouts. */
export const createTag = (ctx: Ctx, text: string, mono = false) => {
  const { tag } = ctx.cfg;
  const { theme } = ctx;

  const el = mk("span", {
    position: "absolute",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    color: "#fff",
    borderRadius: `${tag.radius}px`,
    transition: "opacity .25s",
  });

  if (tag.style === "solid") {
    Object.assign(el.style, {
      background: theme.primary,
      padding: "3px 6px",
      font: "600 11px/1 system-ui, -apple-system, Segoe UI, sans-serif",
    });
  } else {
    Object.assign(el.style, {
      background: "rgba(16,16,28,.92)",
      border: "1px solid rgba(255,255,255,.12)",
      padding: mono ? "3px 6px" : "3px 7px",
      letterSpacing: ".01em",
      font: mono
        ? "500 10.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace"
        : "600 11px/1.2 system-ui, -apple-system, Segoe UI, sans-serif",
    });
  }

  el.textContent = text;
  return el;
};
