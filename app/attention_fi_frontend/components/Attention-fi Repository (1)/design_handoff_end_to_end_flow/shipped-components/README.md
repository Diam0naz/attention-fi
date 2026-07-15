# AttentionFi — shipped components

Six components that close the flow-audit gaps (wallet connect, tx status, handle
verification, error/empty states, settings, notifications). Built to match the
existing repo conventions in `app/attention_fi_frontend/`:

- Tailwind v4 utility classes, no inline styles
- `cn()` from `@/lib/utils`, custom tokens `text-signal` / `text-noise` / `text-pulse`
  already defined in `app/globals.css`
- `lucide-react` icons, `"use client"` on anything with state
- Design reference: Token Trading Page.dc.html, turn 12 (options 12a–12f)

## Drop-in paths

Copy each file into the matching path under `app/attention_fi_frontend/`:

- `wallet/wallet-connect-modal.tsx` → `components/wallet/wallet-connect-modal.tsx`
- `wallet/tx-status.tsx` → `components/wallet/tx-status.tsx`
- `onboarding/verify-handle-flow.tsx` → `components/onboarding/verify-handle-flow.tsx`
- `ui/state-card.tsx` → `components/ui/state-card.tsx`
- `settings/settings-panel.tsx` → `components/settings/settings-panel.tsx`
- `notifications/notifications-panel.tsx` → `components/notifications/notifications-panel.tsx`

None of these are wired to the Anchor program yet — Phase 0 is mock data only,
same as `signal-board.tsx`. Each component takes the real data/handlers as
props so wiring is a matter of passing live values once Phase 1 lands.

I can't push to GitHub directly — copy these files in, or hand this folder to
Claude Code for the actual PR.
