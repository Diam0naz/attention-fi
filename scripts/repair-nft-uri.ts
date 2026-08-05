/**
 * Point blank mpl-core assets at their metadata endpoint.
 *
 * An asset's `uri` is written once at mint. Assets minted before the frontend
 * set one carry an empty string, which is not a broken link but no link at
 * all: a wallet has nothing to fetch, so it shows the on-chain name and no
 * artwork. The cards were always renderable — nothing ever pointed at them.
 *
 * This is fixable without touching the program. mpl-core's UpdateV1 lets the
 * update authority rewrite `uri` in place, and on these assets the update
 * authority is the wallet that minted them. No new instruction, no redeploy,
 * no authority handover.
 *
 * By default it only reports what it would do:
 *
 *   npx tsx scripts/repair-nft-uri.ts
 *   npx tsx scripts/repair-nft-uri.ts --apply
 *
 * Scans every Core asset the wallet holds, skips any that already have a uri
 * (a creator's own artwork is never overwritten), and classifies the rest by
 * which program PDA describes them, so a genesis asset gets the genesis
 * endpoint rather than a generic one.
 *
 * Wallet defaults to ~/.config/solana/id.json (override with ANCHOR_WALLET),
 * cluster to devnet (ANCHOR_PROVIDER_URL). The base URL for the metadata
 * endpoints comes from APP_URL and is written on-chain permanently, so point
 * it at the canonical deployment, never a preview.
 */
import * as anchor from "@anchor-lang/core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { PublicKey, Keypair, Connection, Transaction, TransactionInstruction, SystemProgram } =
  anchor.web3;

type Pubkey = InstanceType<typeof PublicKey>;

const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const PROGRAM_ID = new PublicKey("8fQW2JbfNytdjJ7LR8dvKWMUtpeQPRqxAa3JZvBLsVVc");

/** mpl-core `Key::AssetV1`. */
const KEY_ASSET_V1 = 1;
/** Instruction index for UpdateV1 in the mpl-core program. */
const UPDATE_V1_DISCRIMINATOR = 15;

function loadKeypair(p: string) {
  const secret = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/**
 * Decode the fixed prefix of a `BaseAssetV1`: key, owner, update authority,
 * then the two length-prefixed strings. Only the head is needed, so this
 * avoids pulling in the mpl-core JS SDK for a read this narrow.
 */
function decodeAsset(data: Buffer): { owner: Pubkey; name: string; uri: string } | null {
  try {
    if (data[0] !== KEY_ASSET_V1) return null;
    const owner = new PublicKey(data.subarray(1, 33));
    let offset = 33;
    const authorityTag = data.readUInt8(offset);
    offset += 1;
    // UpdateAuthority::None carries no pubkey; Address and Collection both do.
    if (authorityTag !== 0) offset += 32;

    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.subarray(offset, offset + nameLen).toString("utf8");
    offset += nameLen;

    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.subarray(offset, offset + uriLen).toString("utf8");
    return { owner, name, uri };
  } catch {
    return null;
  }
}

/** Borsh `Option<String>`: presence byte, then u32 length, then utf8. */
function optionString(value: string | null): Buffer {
  if (value === null) return Buffer.from([0]);
  const bytes = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([Buffer.from([1]), len, bytes]);
}

/**
 * Build an UpdateV1 that changes only `uri`.
 *
 * Account order is fixed by the program. Optional accounts are not omitted —
 * mpl-core expects the slot to be filled with its own program id when unused,
 * so the positions never shift.
 */
function updateUriIx(asset: Pubkey, authority: Pubkey, newUri: string): InstanceType<typeof TransactionInstruction> {
  const data = Buffer.concat([
    Buffer.from([UPDATE_V1_DISCRIMINATOR]),
    optionString(null), // new_name: unchanged
    optionString(newUri),
    Buffer.from([0]), // new_update_authority: unchanged
  ]);

  return new TransactionInstruction({
    programId: MPL_CORE_ID,
    data,
    keys: [
      { pubkey: asset, isSigner: false, isWritable: true },
      // No collection: the slot holds the program id instead.
      { pubkey: MPL_CORE_ID, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true }, // payer
      { pubkey: authority, isSigner: true, isWritable: false }, // update authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // No SPL Noop.
      { pubkey: MPL_CORE_ID, isSigner: false, isWritable: false },
    ],
  });
}

/** Which metadata endpoint an asset should point at, by the PDA that owns it. */
async function classify(
  connection: InstanceType<typeof Connection>,
  asset: Pubkey,
): Promise<"perk" | "genesis" | "custom"> {
  for (const [seed, cls] of [
    ["perk", "perk"],
    ["genesis", "genesis"],
  ] as const) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(seed), asset.toBuffer()],
      PROGRAM_ID,
    );
    if (await connection.getAccountInfo(pda)) return cls;
  }
  return "custom";
}

async function main() {
  const apply = process.argv.includes("--apply");

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) {
    console.error("error: APP_URL is required — it is written on-chain permanently.");
    console.error("  APP_URL=https://your-app.vercel.app npx tsx scripts/repair-nft-uri.ts");
    process.exit(1);
  }
  if (!/^https:\/\//.test(appUrl)) {
    console.error(`error: APP_URL must be https, got ${appUrl}`);
    process.exit(1);
  }

  const walletPath =
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json");
  const wallet = loadKeypair(walletPath);
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  console.log(`wallet   ${wallet.publicKey.toBase58()}`);
  console.log(`cluster  ${rpc}`);
  console.log(`base url ${appUrl}`);
  console.log(apply ? "mode     APPLY\n" : "mode     dry run (pass --apply to send)\n");

  // Owner sits at byte 1, straight after the 1-byte key. Only the owner is
  // filtered on: matching the key byte too would mean base58-encoding a single
  // byte, and that isn't worth an encoding dependency when decodeAsset already
  // rejects anything that isn't an AssetV1 a few lines below.
  const accounts = await connection.getProgramAccounts(MPL_CORE_ID, {
    filters: [{ memcmp: { offset: 1, bytes: wallet.publicKey.toBase58() } }],
  });

  console.log(`found ${accounts.length} asset(s) held by this wallet`);

  let repaired = 0;
  let skipped = 0;
  for (const { pubkey, account } of accounts) {
    const decoded = decodeAsset(account.data as Buffer);
    if (!decoded) continue;

    if (decoded.uri.trim() !== "") {
      console.log(`  skip   ${pubkey.toBase58()}  "${decoded.name}" — already has a uri`);
      skipped += 1;
      continue;
    }

    const cls = await classify(connection, pubkey);
    const uri =
      cls === "custom"
        ? `${appUrl}/api/nft/custom/${pubkey.toBase58()}`
        : `${appUrl}/api/nft/${cls}/${pubkey.toBase58()}`;

    console.log(`  repair ${pubkey.toBase58()}  "${decoded.name}"  [${cls}]`);
    console.log(`         -> ${uri}`);

    if (apply) {
      const tx = new Transaction().add(updateUriIx(pubkey, wallet.publicKey, uri));
      const sig = await connection.sendTransaction(tx, [wallet], { preflightCommitment: "confirmed" });
      await connection.confirmTransaction(sig, "confirmed");
      console.log(`         sent ${sig}`);
    }
    repaired += 1;
  }

  console.log(
    `\n${apply ? "repaired" : "would repair"} ${repaired}, skipped ${skipped} (already had a uri)`,
  );
  if (!apply && repaired > 0) console.log("re-run with --apply to send.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
