import * as anchor from "@anchor-lang/core";
async function main() {
  const idl = require("./target/idl/attention_fi.json");
  const conn = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed",
  );
  const program = new anchor.Program(
    idl,
    new anchor.AnchorProvider(conn, anchor.Wallet.local(), {}),
  ) as any;
  const P = program.programId;
  const pda = (s: string) =>
    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from(s)], P)[0];
  const g = await program.account.guardians.fetchNullable(pda("guardians"));
  const lp = await program.account.launchPolicy.fetchNullable(
    pda("launchpolicy"),
  );
  console.log(
    "guardians   :",
    g ? `${g.threshold}-of-${g.count}, paused=${g.paused}` : "NOT SET",
  );
  console.log(
    "launchPolicy:",
    lp
      ? `${lp.maxLaunches} per ${lp.windowSecs}s`
      : "not set (defaults: 3 per 24h)",
  );
  const dis = await program.account.tokenDisavowal.all();
  console.log("disavowals  :", dis.length);
  const curves = await program.account.bondingCurve.all();
  console.log("curves      :", curves.length);
}
main().catch((e) => console.error("failed:", e.message));
