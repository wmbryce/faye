import "dotenv/config";
import { publisherTick } from "@/lib/publisher/tick";

async function main() {
  const r = await publisherTick();
  console.log(`publisher-tick: attempted=${r.attempted} published=${r.published} errors=${r.errors.length}`);
  if (r.errors.length > 0) {
    for (const e of r.errors) console.error(`  ad=${e.adId} error=${e.error}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
