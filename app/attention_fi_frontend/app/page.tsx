import { TickerTape } from "@/components/feed/ticker-tape";
import { Hero } from "@/components/feed/hero";
import { SignalBoard } from "@/components/feed/signal-board";
import { Thesis } from "@/components/feed/thesis";
import { Mechanism } from "@/components/feed/mechanism";
import { Verticals } from "@/components/feed/verticals";
import { Footer } from "@/components/feed/footer";

export default function Home() {
  return (
    <>
      <TickerTape />
      <main className="flex-1">
        <Hero />
        <SignalBoard />
        <Thesis />
        <Mechanism />
        <Verticals />
        <Footer />
      </main>
    </>
  );
}
