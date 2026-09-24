// Games live in public/games/<slug>/ (copied from ../ by `pnpm sync-games`).
export type Game = {
  slug: string;
  entry: string; // html file inside the game folder
  title: string;
  variety: string; // seed-packet pun
  blurb: string;
  tags: string[];
  sprouts: string; // how long a session takes
  colors: { paper: string; ink: string; accent: string };
};

export const games: Game[] = [
  {
    slug: "tower_defense",
    entry: "index.html",
    title: "Wormhold",
    variety: "Belligerent Earthworm",
    blurb:
      "The grub legion is crawling up your hill. One stone fort, one pink worm and a crate full of terrible ideas.",
    tags: ["artillery", "defense"],
    sprouts: "10 min",
    colors: { paper: "#f7c6cf", ink: "#5a1a2b", accent: "#e0457b" },
  },
  {
    slug: "the_night_of_hollowmere",
    entry: "index.html",
    title: "The Long Night of Hollowmere",
    variety: "Night-blooming Lantern",
    blurb:
      "Keep the lanterns lit, find the lens shards and relight the lighthouse before the night swallows the town.",
    tags: ["rpg", "siege"],
    sprouts: "30 min",
    colors: { paper: "#c9d4ea", ink: "#1b2447", accent: "#e9a93b" },
  },
  {
    slug: "the_echo_run",
    entry: "the-echo-run.html",
    title: "The Echo Run",
    variety: "Perennial Ghost Fern",
    blurb:
      "The dungeon is a loop and it remembers everyone who died in it. Fight their echoes for relics, or recruit them.",
    tags: ["roguelike", "dungeon"],
    sprouts: "15 min",
    colors: { paper: "#cfe3d4", ink: "#173a2b", accent: "#3f9a6b" },
  },
  {
    slug: "mystery",
    entry: "index.html",
    title: "Last Train Out",
    variety: "Midnight Nightshade",
    blurb:
      "File 47-1130. Julian Marsh is dead and the last train is leaving. Read the case notes, find who did it.",
    tags: ["mystery", "deduction"],
    sprouts: "20 min",
    colors: { paper: "#e8dcc0", ink: "#2b2118", accent: "#b23a2a" },
  },
  {
    slug: "binary_puzzle",
    entry: "index.html",
    title: "Bitflip",
    variety: "Binary Brassica",
    blurb:
      "Takuzu, a.k.a. Binairo. Fill every socket with a 0 or a 1, never three in a row, and let logic do the rest.",
    tags: ["logic", "puzzle"],
    sprouts: "5 min",
    colors: { paper: "#f4e27a", ink: "#2e2a0c", accent: "#3a6ee8" },
  },
];

export const gameSrc = (g: Game) => `/games/${g.slug}/${g.entry}`;
