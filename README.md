# GameGarden

A small plot of hand-grown, single-page browser games.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

## Adding a game

1. Put the game in its own folder next to `game_garden/` (e.g. `../my_game/index.html`).
2. Add the folder to the `sync-games` script in `package.json` and run `pnpm sync-games`.
   This copies it into `public/games/`, which is what gets deployed.
3. Add an entry to `app/games.ts` (title, blurb, packet colours, entry file).
4. Drop a screenshot at `public/shots/<slug>.jpg` for the seed-packet art.

Games are served from `/games/<slug>/<entry>` and played at `/play/<slug>` inside an iframe.
