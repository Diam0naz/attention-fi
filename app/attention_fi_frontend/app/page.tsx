import { TickerTape } from "@/components/feed/ticker-tape";
import { Hero } from "@/components/feed/hero";
import { SignalBoard } from "@/components/feed/signal-board";
import { Footer } from "@/components/feed/footer";

export default function Home() {
  return (
    <>
      <TickerTape />
      <main className="flex-1">
        <Hero />
        <SignalBoard />
        <Footer />
      </main>
    </>
  );
}
