/* Price-guard checks. Run with: node tests/price-guard.mjs

   ⚠️ Lives here, NOT in netlify/functions. Netlify treats every file in the
   functions directory as a function and rejects names containing dots, so a
   test file in there fails the whole deploy.

   No test framework on purpose — this repo has no build step, and one file of
   assertions is cheaper to maintain than a dependency. */

import { readFileSync } from "node:fs";
import { moneyKeys, inventsPrice } from "../netlify/functions/assistant.mjs";

const doc = readFileSync(new URL("../assistant-kb.txt", import.meta.url), "utf8");
const allowed = new Set(moneyKeys(doc));

let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  (got ${got}, want ${want})`));
}

console.log("\nAllowlist derived from assistant-kb.txt:");
console.log("  " + [...allowed].sort().join("  "));

console.log("\nReplies that must PASS (every figure is published):");
check("plain price", inventsPrice("A Shopify store is from £1,450.", allowed), false);
check("comma-less", inventsPrice("A Shopify store is from £1450.", allowed), false);
check("monthly", inventsPrice("Care is £119/month, cancel anytime.", allowed), false);
check("two prices", inventsPrice("Sites are £895 and stores from £1,450.", allowed), false);
check("range both symbols", inventsPrice("Agencies quote £8,000–£10,000.", allowed), false);
check("founding + standard", inventsPrice("£750 now, £1,250 later.", allowed), false);
check("no figures at all", inventsPrice("The build takes 7 working days.", allowed), false);
check("percent and days", inventsPrice("50% upfront, live in 7 working days, mockup in 48 hours.", allowed), false);
check("words form", inventsPrice("It is 895 pounds.", allowed), false);

console.log("\nReplies that must DEFLECT (a figure that is not published):");
check("invented figure", inventsPrice("I could do it for £600.", allowed), true);
check("currency conversion", inventsPrice("That's about $1,195.", allowed), true);
check("euro conversion", inventsPrice("Roughly €1,045.", allowed), true);
check("rounded approximation", inventsPrice("Around £900.", allowed), true);
check("visitor budget echoed", inventsPrice("£500 is below the £895 starting point.", allowed), true);
check("retired price", inventsPrice("Custom systems start at £2,950.", allowed), true);
check("range with bare upper", inventsPrice("Agencies charge £8,000–9,500.", allowed), true);
check("dollars in words", inventsPrice("That is 1200 dollars.", allowed), true);

console.log("\nFail-closed:");
check("empty allowlist deflects", inventsPrice("£895", new Set()), true);

console.log(failed ? `\n${failed} FAILED\n` : "\nall passed\n");
process.exit(failed ? 1 : 0);
