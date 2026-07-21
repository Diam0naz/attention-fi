import { X_HANDLE, X_URL } from "@/lib/config";
import { Logo } from "@/components/brand/logo";

// v0 gates v1: footer links point to landing-page sections, not app surfaces.
const PRODUCT = [
  { label: "Thesis", href: "/#thesis" },
  { label: "Mechanism Design", href: "/#mechanism" },
  { label: "Verticals", href: "/#verticals" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/[0.08]">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo size={20} />
            <p className="mt-2 text-[12px] leading-relaxed text-[#6B6B6B]">
              Pump.fun for X — mindshare is the asset. Trade the attention of the X
              social graph on bonding curves seeded by real data.
            </p>
            <a
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex font-mono text-[11px] text-[#9aa4af] transition-colors hover:text-signal"
            >
              Follow @{X_HANDLE} on X →
            </a>
          </div>

          <div className="flex gap-12 font-mono text-[11px]">
            <div className="flex flex-col gap-2 text-[#6B6B6B]">
              <span className="text-[9px] uppercase tracking-[0.1em] text-[#4b5563]">Product</span>
              {PRODUCT.map((l) => (
                <a key={l.href} href={l.href} className="transition-colors hover:text-[#F5F4F0]">
                  {l.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-2 text-[#6B6B6B]">
              <span className="text-[9px] uppercase tracking-[0.1em] text-[#4b5563]">Community</span>
              <a href={X_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#F5F4F0]">
                X / Twitter
              </a>
              <span className="cursor-pointer transition-colors hover:text-[#F5F4F0]">Waitlist</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/[0.06] pt-5 font-mono text-[10px] text-[#4b5563] sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 AttentionFi · Phase 0 preview</span>
          <span>Experimental software · not audited · not financial advice</span>
        </div>
      </div>
    </footer>
  );
}
