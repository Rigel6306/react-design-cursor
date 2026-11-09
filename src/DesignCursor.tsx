import React, { useEffect, useMemo, useRef } from "react";
import { resolveConfig } from "./config/config";
import { createRunner } from "./core/runner";
import type { DesignCursorProps } from "./types/types";

/**
 * Wrap anything: its elements are "designed" into view by a cursor drawing selection boxes.
 *
 *   <DesignCursor variant="minimal" color="#3b82f6">…</DesignCursor>   // original flat look
 *   <DesignCursor>…</DesignCursor>                                       // aurora look (default)
 *   <DesignCursor box={{ breathing: false }} effects={{ dust: false }}>…</DesignCursor>
 */
export const DesignCursor = ({ children, className, style, onComplete, ...options }: DesignCursorProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* A serialised key keeps inline object/array props from restarting the animation every render. */
  const key = JSON.stringify(options);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cfg = useMemo(() => resolveConfig(options), [key]);

  const onCompleteRef = useRef<(() => void) | undefined>(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const overlay = overlayRef.current;
    if (!root || !content || !overlay) return;

    /* Content starts hidden (inline style) so nothing flashes before the
       animation begins. Reduced motion: just show it. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      content.style.visibility = "visible";
      return;
    }

    const runner = createRunner({
      root,
      content,
      overlay,
      cfg,
      onComplete: () => onCompleteRef.current?.(),
    });
    return () => runner.destroy();
  }, [cfg]);

  return (
    <div ref={rootRef} className={className} style={{ position: "relative", ...style }}>
      {/* No-JS users still see the content. */}
      <noscript>
        <style>{`.dc-content{visibility:visible!important}`}</style>
      </noscript>
      <div ref={contentRef} className="dc-content" style={{ visibility: "hidden" }}>
        {children}
      </div>
      <div
        ref={overlayRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 50,
          overflow: "visible",
          contain: "layout style",
        }}
      />
    </div>
  );
};

export default DesignCursor;
