# Arcium — Confidential Mindshare Aggregation (Phase 3 design)

> Status: **design only, not yet built.** This documents the integration path and
> the compatibility constraint that gates it.

## Why

The strategy brief's highest-value confidentiality use is **private mindshare
aggregation (no gaming the oracle)**: if the raw inputs that produce a subject's
mindshare score are observable on-chain, they can be targeted — coordinated
mentions, bot engagement — to pump a token's seed price. Computing the
aggregation inside an [Arcium](https://arcium.com) MXE (Multi-party eXecution
Environment) keeps the inputs encrypted end-to-end, so they can't be observed and
therefore can't be gamed. This is the confidential sibling of the existing
`launch_from_feed` Switchboard path.

## The compatibility constraint (read first)

AttentionFi is on **Anchor 0.32 / solana-program 2.3**. Arcium's crate line splits:

| `arcium-anchor` | Requires | Usable here? |
| --- | --- | --- |
| `0.4.0` – **`0.9.7`** | anchor-lang **^0.32.1** | ✅ yes — compatible as-is |
| `0.10.0` – `0.13.x` | anchor-lang **==1.0.x** + solana 3 | ❌ needs a full Anchor 1.0 migration |

**Do not take the 1.0 path.** `mpl-core 0.11.2`, the SAS client, and
`switchboard-on-demand 0.13` all target Anchor 0.30–0.32 / solana 2.x; upgrading
AttentionFi to Anchor 1.0 + solana 3 would break all three integrations. The
clean path is to **pin `arcium-anchor = "=0.9.7"`** and run a matching **0.9.x**
Arcium toolchain (the machine currently has CLI `arcium 0.10.4`, which targets the
1.0 line — switch it with `arcup install <0.9.x>`).

## Integration shape

1. **Arcis circuit** (`encrypted-ixs/mindshare_agg`): takes encrypted engagement
   inputs (smart-follower weights, mention counts) and returns the weighted
   mindshare score (or directly the tier discriminant).
2. **`request_mindshare(mint, enc_inputs)`** — an Anchor instruction that queues
   the MXE computation (CPI to the Arcium program) and stores a pending record.
3. **`mindshare_callback(result)`** — the Arcium-invoked callback that receives
   the computed score and seeds the curve's `virtual_sol_reserves` via the
   existing `oracle::tier_from_mindshare_bps` mapping (already unit-tested).

This reuses the tier→seed logic already in the program; only the *source* of the
score changes (confidential MXE instead of a plaintext feed).

## Build checklist (when we proceed)

- [ ] `arcup install` a 0.9.x toolchain; confirm `arcium --version` matches `arcium-anchor 0.9.7`.
- [ ] Add `arcium-anchor = "=0.9.7"` (+ `arcis-imports`) and confirm `anchor build` still links mpl-core / SAS / switchboard.
- [ ] Author `mindshare_agg` in Arcis; `arcium build` the MXE.
- [ ] Add `request_mindshare` + `mindshare_callback`; wire the computation-definition account.
- [ ] Test on the Arcium localnet cluster (`arcium`/`arcup` managed).

## References

- Program events already emitted (`LaunchEvent`, …) mean off-chain indexers can
  observe *outputs* without ever seeing the confidential *inputs*.
- Non-confidential fallback: `launch_from_feed` (Switchboard) remains available.
