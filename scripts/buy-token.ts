/**
 * Buy from a bonding curve — proves the buy instruction/account layout on-chain.
 * Usage: npx ts-node scripts/buy-token.ts <mint> [solAmount=0.05]
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import * as fs from "fs";
import * as os from "os";

const { PublicKey, Keypair, Connection } = anchor.web3;
const TOKEN = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const ata = (owner: anchor.web3.PublicKey, mint: anchor.web3.PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), mint.toBuffer()], ATA_PROG)[0];

async function main() {
  const mint = new PublicKey(process.argv[2]!);
  const solAmount = parseFloat(process.argv[3] ?? "0.05");

  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
  const buyer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const provider = new anchor.AnchorProvider(new Connection(rpc, "confirmed"), new anchor.Wallet(buyer), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync("target/idl/attention_fi.json", "utf8"));
  const program = new Program(idl, provider) as Program<AttentionFi>;

  const [curve] = PublicKey.findProgramAddressSync([Buffer.from("curve"), mint.toBuffer()], program.programId);
  const [global] = PublicKey.findProgramAddressSync([Buffer.from("global")], program.programId);
  const g = await program.account.global.fetch(global);
  const before = await program.account.bondingCurve.fetch(curve);

  const lamports = Math.floor(solAmount * 1e9);
  // constant product estimate, 5% slippage floor
  const x = Number(before.virtualSolReserves), y = Number(before.virtualTokenReserves);
  const expected = y - (x * y) / (x + lamports);
  const minOut = Math.floor(expected * 0.95);

  console.log(`Buying ${solAmount} SOL of ${mint.toBase58()} (minOut ${minOut})`);
  const sig = await program.methods
    .buy(new anchor.BN(lamports), new anchor.BN(minOut))
    .accountsPartial({
      buyer: buyer.publicKey,
      treasury: g.treasury,
      curve,
      mint,
      vault: ata(curve, mint),
      buyerTokenAccount: ata(buyer.publicKey, mint),
      perk: null,
    })
    .rpc();
  console.log(`tx: ${sig}`);

  const after = await program.account.bondingCurve.fetch(curve);
  console.log(`real_sol_reserves : ${before.realSolReserves.toString()} -> ${after.realSolReserves.toString()}`);
  console.log(`virtual_token     : ${before.virtualTokenReserves.toString()} -> ${after.virtualTokenReserves.toString()}`);
  console.log(`creator_fees      : ${after.creatorFees.toString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
