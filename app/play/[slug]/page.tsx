import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { gameSrc, games } from "../../games";
import { Player } from "./player";

export const dynamicParams = false;

export function generateStaticParams() {
  return games.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/play/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = games.find((g) => g.slug === slug);
  return game ? { title: game.title, description: game.blurb } : {};
}

export default async function PlayPage({ params }: PageProps<"/play/[slug]">) {
  const { slug } = await params;
  const game = games.find((g) => g.slug === slug);
  if (!game) notFound();

  return (
    <Player
      src={gameSrc(game)}
      title={game.title}
      style={{ "--accent": game.colors.accent, "--paper": game.colors.paper } as React.CSSProperties}
    >
      <Link href="/" className="bar-btn">
        ◂ <span className="hide-sm">Back to the</span> garden
      </Link>
      <div className="player-name">
        <span className="player-title">{game.title}</span>
        <span className="player-variety">{game.variety}</span>
      </div>
    </Player>
  );
}
