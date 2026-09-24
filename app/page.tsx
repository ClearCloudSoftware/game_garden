import Link from "next/link";
import { games } from "./games";
import { CLOUD, FLOWER, Pixels, SPROUT, SUN } from "./pixels";

const sky = { Y: "#ffd23f", O: "#f08a24", W: "#fff6c9" };
const cloud = { W: "#fffdf5", S: "#d7ecef" };
const sprout = { L: "#7cc15a", G: "#3f7d2e" };
const flowers = ["#e0457b", "#f4e27a", "#ffffff", "#e9a93b"];

export default function Home() {
  return (
    <>
      <header className="hero">
        <Pixels art={SUN} palette={sky} scale={9} className="sun" />
        <Pixels art={CLOUD} palette={cloud} scale={7} className="cloud cloud-a" />
        <Pixels art={CLOUD} palette={cloud} scale={5} className="cloud cloud-b" />

        <div className="hero-copy">
          <p className="pixel-tag">Est. 2026 · {games.length} varieties in stock</p>
          <h1 className="wordmark">
            Game<em>Garden</em>
          </h1>
          <p className="hero-lede">
            A small plot of hand-grown browser games. Pick a seed packet, plant it,
            and play. No installs, no ads, no weeds.
          </p>
          <a href="#rack" className="dig-btn">
            Start digging ▾
          </a>
        </div>

        <div className="hill" aria-hidden>
          <div className="flowerbed">
            {Array.from({ length: 14 }, (_, i) => (
              <Pixels
                key={i}
                art={FLOWER}
                palette={{ P: flowers[i % flowers.length], Y: "#f08a24", G: "#3f7d2e", L: "#7cc15a" }}
                scale={5}
                className="flower"
              />
            ))}
          </div>
        </div>
      </header>

      <main id="rack" className="soil">
        <div className="rack-head">
          <h2 className="pixel-tag sun-ink">▸ The seed rack</h2>
          <p>Every packet is a whole game in a single page. Tap one to plant it.</p>
        </div>

        <ul className="rack">
          {games.map((g, i) => (
            <li key={g.slug} style={{ "--i": i } as React.CSSProperties}>
              <Link
                href={`/play/${g.slug}`}
                className="packet"
                style={
                  {
                    "--paper": g.colors.paper,
                    "--ink": g.colors.ink,
                    "--accent": g.colors.accent,
                  } as React.CSSProperties
                }
              >
                <Pixels art={SPROUT} palette={sprout} scale={6} className="packet-sprout" />
                <span className="packet-perf">
                  GameGarden Seed Co. <span>No. {String(i + 1).padStart(2, "0")}</span>
                </span>
                <span className="packet-art">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot, no optimisation needed */}
                  <img src={`/shots/${g.slug}.jpg`} alt="" loading="lazy" />
                </span>
                <span className="packet-title">{g.title}</span>
                <span className="packet-variety">{g.variety}</span>
                <span className="packet-blurb">{g.blurb}</span>
                <span className="packet-facts">
                  <span>
                    <b>Sprouts in</b> {g.sprouts}
                  </span>
                  <span>
                    <b>Type</b> {g.tags.join(" · ")}
                  </span>
                </span>
                <span className="packet-cta">Plant + play ▸</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <footer className="footer">
        <span className="pixel-tag">GameGarden</span>
        <span>Grown slowly, played quickly.</span>
      </footer>
    </>
  );
}
