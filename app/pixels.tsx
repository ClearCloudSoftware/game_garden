// Tiny pixel-art renderer: each string is a row, each char a palette key ("." = empty).
export function Pixels({
  art,
  palette,
  scale = 6,
  className,
}: {
  art: string[];
  palette: Record<string, string>;
  scale?: number;
  className?: string;
}) {
  const w = art[0].length;
  const h = art.length;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {art.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[c]} />
          ),
        ),
      )}
    </svg>
  );
}

export const SUN = [
  "......Y......",
  "..Y.......Y..",
  "....OOOOO....",
  "...OYYYYYO...",
  "..OYYWWYYYO..",
  "..OYWYYYYYO..",
  "Y.OYYYYYYYO.Y",
  "..OYYYYYYYO..",
  "..OYYYYYYYO..",
  "...OYYYYYO...",
  "....OOOOO....",
  "..Y.......Y..",
  "......Y......",
];

export const CLOUD = [
  ".....WWWW.......",
  "...WWWWWWWW.WW..",
  ".WWWWWWWWWWWWWW.",
  "WWWWWWWWWWWWWWWW",
  ".SSSSSSSSSSSSSS.",
];

export const SPROUT = [
  "LL...LL",
  "LLL.LLL",
  ".LLGLL.",
  "...G...",
  "...G...",
  "...G...",
];

export const FLOWER = [
  ".P.P.",
  "PPYPP",
  ".P.P.",
  "..G..",
  "GLG..",
  "..G..",
];
