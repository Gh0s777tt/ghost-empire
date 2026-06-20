// scripts/setup-vapid.mjs
// One-shot VAPID setup for web push (#533). Generates a VAPID keypair and stores it in
// Vercel's env (production), WITHOUT the private key ever printing to a terminal/log and
// WITHOUT any API token in a file or chat — it uses YOUR `vercel` CLI login.
//
// Usage (run from ghost-empire-web/):
//   npx vercel login        # once, if you're not already logged in
//   npx vercel link         # once, to link this folder to the Vercel project
//   node scripts/setup-vapid.mjs
//   npx vercel --prod       # redeploy so the new env goes live
//
// The value of each var is piped via stdin, so it never appears as a CLI argument and
// is never echoed. Only the PUBLIC key is printed at the end (it's public by design).
import webpush from "web-push";
import { execSync } from "node:child_process";

const SUBJECT = process.env.VAPID_SUBJECT || "mailto:dzierzawskii98.dam@gmail.com";

function setEnv(name, value) {
  try {
    // `vercel env add <name> production` reads the value from stdin when piped.
    execSync(`npx vercel env add ${name} production`, { input: value + "\n", stdio: ["pipe", "inherit", "inherit"] });
  } catch {
    console.error(`\n[!] Could not set ${name}. If it already exists, run:  npx vercel env rm ${name} production  then re-run this script.`);
    process.exit(1);
  }
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("Setting VAPID env on Vercel (production)...\n");
setEnv("VAPID_PUBLIC_KEY", publicKey);
setEnv("VAPID_PRIVATE_KEY", privateKey);
setEnv("VAPID_SUBJECT", SUBJECT);

console.log("\n[OK] Done. Public key (safe to share / verify against /api/push/vapid):\n" + publicKey);
console.log("\nNow redeploy so the new env is live:\n  npx vercel --prod");
