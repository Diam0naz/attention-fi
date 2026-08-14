# AttentionFi: pricing attention at the moment of issuance

*A technical note on market structure for attention-backed assets on Solana.*

---

## The problem

Attention already behaves like an asset. It compounds, it decays, it can be
manufactured, and it reliably front-runs price. What it lacks is market
structure — an issuance mechanism that takes a measurement of attention as an
input and produces a priced instrument as an output.

The usual approach is to launch every token identically and let the market
discover the difference. That works, slowly, and it hands the entire information
advantage to whoever already knew the subject mattered. A token for an account
with 3% of the conversation and a token for an account with 0.01% open at the
same price and find their level over hours or days.

AttentionFi's premise is narrow: **the measurement should be an input to
issuance, not something the market has to rediscover afterwards.**

---

## Seeding a curve from mindshare

A bonding curve's opening price is a function of its virtual reserves. Set them
low and the token starts near zero; set them high and it starts expensive. That
number is normally a constant.

Here it is derived on-chain from a mindshare oracle:

```rust
pub fn tier_from_mindshare_bps(bps: u64) -> MindshareTier {
    if bps >= 300      { MindshareTier::Top10 }      // ≥ 3%
    else if bps >= 100 { MindshareTier::Top100 }     // ≥ 1%
    else if bps >= 40  { MindshareTier::Emerging }   // ≥ 0.4%
    else               { MindshareTier::NewEntrant }
}
```

Each tier maps to virtual SOL reserves:

| Tier | Share of conversation | Seed reserves |
|---|---|---|
| Top 10 | ≥ 3% | 100 SOL |
| Top 100 | ≥ 1% | 26.7 SOL |
| Emerging | ≥ 0.4% | 5.33 SOL |
| New | < 0.4% | 0.5 SOL |

A 200× spread in opening price, decided before the first trade.

### Why the oracle reads an average, not a spot value

This is the part that matters, and it is a governance property rather than an
implementation detail.

Mindshare measured at an instant is trivially gameable. Coordinate a burst of
mentions, launch into the spike, and the curve seeds at a price the following
day cannot support — the launcher captures the difference and every subsequent
buyer eats it.

So the on-chain feed reads a **24-hour time-weighted average**, and the
weighting is by *duration a reading stood*, not by sample count. A reading that
held for six hours counts six times one that held for one. Sampling more often
during a spike cannot manufacture weight.

The feed also publishes its own coverage — what fraction of the window the
history actually spans — so a consumer can tell a genuine 24-hour average from
a thin one. A new handle with two hours of history is launchable, but the number
it launches against is labelled as what it is.

Manipulating a duration-weighted average requires holding manufactured attention
for hours. At that point the distinction between manufactured attention and
attention has largely collapsed, which is the intended property.

---

## Four issuance mechanisms

Not every subject should be issued the same way, so the launch path is a choice:

**Bonding curve.** Constant-product against virtual reserves, seeded by tier.
Graduates to a native AMM pool at 85 SOL of accumulated reserves. Graduation is
a trapdoor — the buy that crosses the threshold sets `complete` and both sides
refuse from that instant, so the interface warns before a trade that would
trigger it.

**Dutch auction.** Price descends from a ceiling to a floor over a set duration.
Removes the advantage of being first in the block: waiting is rewarded, so there
is nothing to snipe.

**Conviction curve.** A slower ascent paired with a time-lock and an early-exit
penalty. Suits subjects where the thesis is measured in months and the
mechanism should discourage tourists.

**Revenue share.** The token is a pro-rata claim on the subject's fee stream
rather than a bet on price.

All four share one launch quota per wallet. A per-mechanism limit is four times
the limit to anyone willing to call a different instruction.

---

## Fee routing

The trading fee is **1%**, split evenly: half to the protocol treasury, half to
the verified creator. The NFT market charges its own 2.5%, deliberately separate
— they fund different things and neither can overcharge a trader, because the
split is applied to one bounded total rather than each charging independently.

The interesting property is that **the creator's half is itself divisible.**

A creator can mint genesis NFTs, each carrying a basis-point share of their own
cut, and sell them. The buyer holds a perpetual claim on that token's fee
stream, paid per trade through a MasterChef-style accumulator — so a holder
accrues correctly no matter when they bought in, and claiming is O(1) rather
than a loop over history.

The dilution comes out of the creator's share, never the protocol's and never
the trader's. Ten NFTs at 1% each is 10% of the creator's stream, forever, and
the minting interface states that arithmetic before signing rather than after.

This makes a creator's future fee income a tradeable instrument at issuance
time, which is the same trick the protocol applies to attention itself.

---

## Four NFT roles, deliberately distinct

The NFT layer is Metaplex Core, and each class exists for a different reason:

- **Verification** — soulbound, minted only against a Solana Attestation Service
  attestation proving control of the X handle. One per wallet.
- **Perk** — soulbound, earned. Cumulative trading activity (1 / 5 / 20 / 75 /
  250 SOL) unlocks fee discount levels the trader claims permissionlessly. Not
  granted by an admin — the program is the issuer.
- **Genesis** — transferable, carries a share of a specific token's fee stream.
- **Collectible** — ordinary transferable art, listable individually or as a
  whole collection.

Two of these are deliberately non-transferable. A fee discount that can be sold
is a fee discount the largest holder buys, and a verification badge that can be
sold is not verification.

---

## Safety design

Three properties worth stating explicitly, because each was chosen against an
easier alternative.

**The pause is asymmetric.** Any *one* guardian can halt the protocol; a
*threshold* is required to resume it. Stopping is the safe direction and
resuming is the dangerous one, so they must not cost the same. Claims stay open
while paused — pausing must not confiscate, only prevent new exposure.

**Disavowal is asymmetric too.** Any guardian can flag a token as disowned by
the person it names; only the authority can clear the flag. A flagged token
closes to *buying* while selling and fee claims stay open. A flag that trapped
holders would be a worse instrument than the problem it addresses.

**Rate limiting uses a sliding window.** A resetting counter permits three
launches at 23:59 and three more at 00:01 — six in two minutes, entirely within
the rules, and finding that boundary is the first thing a script does. Storing
the actual timestamps costs 24 bytes and means what it says.

None of these are sybil resistance, and the code says so where it implements
them. They bound a wallet, not a person. That job belongs to attestation and
curation.

---

## Status

Honest accounting, because the alternative is worse:

**Live on devnet.** 58 instructions, 96 unit tests and 68 integration tests
passing, deployed bytecode hash-verified against the tested build. Four launch
mechanisms, the NFT layer, fee routing, SAS verification, the Switchboard
oracle, guardian pause, disavowal and rate limiting all execute end to end.

**Not yet done.** No external audit. No mainnet deployment. The mindshare
pipeline runs against a deterministic engine unless aggregator credentials are
configured, so the numbers are structurally real and empirically synthetic in
that mode — the code path is identical, the substrate is not.

The bugs worth knowing about were found by use rather than review: a collection
sale that transferred authority without ownership, a listing PDA that could be
opened exactly once, a launch screen that priced every token off a constant. All
fixed; all recorded in `docs/BUILD-LOG.md` with the reasoning, because the
reasoning is the part that transfers.

---

*Built on Solana with Anchor, Metaplex Core, Switchboard On-Demand and the
Solana Attestation Service.*
