import { config } from 'dotenv';
config({ path: '.env.local' });
import { zohoClient } from './src/lib/zoho';

async function run() {
  const p = await zohoClient.getPainters();
  console.log("All Painters count:", p.length);
  console.log("Painters in Zoho (first 5):", p.slice(0, 5));
  const maddie = p.find(x => x.Name === "Maddie" || x.Name?.includes("Maddie"));
  console.log("Maddie in Zoho:", maddie);
}
run().catch(console.error);
