import { Hero } from "@/components/feed/hero";
import { TrendingWall } from "@/components/feed/trending-wall";
import { SignalBoard } from "@/components/feed/signal-board";
import { Thesis } from "@/components/feed/thesis";
import { Mechanism } from "@/components/feed/mechanism";
import { Verticals } from "@/components/feed/verticals";
import { Footer } from "@/components/feed/footer";

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <Hero />
        <TrendingWall />
        <SignalBoard />
        <Thesis />
        <Mechanism />
        <Verticals />
        <Footer />
      </main>
    </>
  );
}
