import { TickerTape } from "@/components/feed/ticker-tape";
import { Hero } from "@/components/feed/hero";
import { SignalBoard } from "@/components/feed/signal-board";

export default function Home() {
  return (
    <>
      <TickerTape />
      <main className="flex-1 pb-24">
        <Hero />
        <SignalBoard />
      </main>
    </>
  );
}
