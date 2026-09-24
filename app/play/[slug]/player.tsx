"use client";

import { useRef } from "react";

export function Player({
  src,
  title,
  style,
  children,
}: {
  src: string;
  title: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLIFrameElement>(null);

  return (
    <div className="player" style={style}>
      <nav className="player-bar">
        {children}
        <div className="player-actions">
          <a href={src} target="_blank" rel="noopener" className="bar-btn hide-sm">
            Pop out ↗
          </a>
          <button
            type="button"
            className="bar-btn bar-btn-hot"
            onClick={() => frame.current?.requestFullscreen()}
          >
            ⛶ <span className="hide-sm">Fullscreen</span>
          </button>
        </div>
      </nav>
      {/* ponytail: no sandbox, these are our own games and need same-origin storage anyway */}
      <iframe
        ref={frame}
        src={src}
        title={title}
        className="player-frame"
        allow="fullscreen; autoplay; gamepad"
        // keyboard-driven games need focus without an extra click
        onLoad={(e) => e.currentTarget.focus()}
      />
    </div>
  );
}
