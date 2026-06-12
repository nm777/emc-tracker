import { calcEMC } from "./index.js";

const usdaTable = [
  [40,  30, 6.3], [40,  50, 9.6], [40,  65, 12.0], [40,  80, 15.9], [40,  90, 21.0],
  [60,  30, 6.1], [60,  50, 9.3], [60,  65, 11.7], [60,  80, 15.6], [60,  90, 20.6],
  [70,  30, 6.0], [70,  50, 9.2], [70,  65, 11.6], [70,  80, 15.5], [70,  90, 20.5],
  [80,  30, 5.9], [80,  50, 9.1], [80,  65, 11.5], [80,  80, 15.3], [80,  90, 20.3],
  [100, 30, 5.8], [100, 50, 8.8], [100, 65, 11.2], [100, 80, 14.9], [100, 90, 19.8],
];

console.log("=== EMC Formula Validation ===");
console.log("Comparing against USDA FPL Wood Handbook Table 4-2");
console.log("Formula: Hailwood-Horrobin (2-hydrate model), T in C");
console.log("Source: calcEMC imported from index.js\n");

let maxDiff = 0;
let failCount = 0;

console.log("Temp F | RH% | USDA   | Ours   | Diff");
console.log("-------|-----|--------|--------|------");

for (const [tempF, rh, expected] of usdaTable) {
  const tempC = (tempF - 32) * 5 / 9;
  const ours = calcEMC(rh, tempC);
  const diff = Math.abs(ours - expected);
  maxDiff = Math.max(maxDiff, diff);
  if (diff > 0.5) failCount++;
  console.log(
    `${String(tempF).padStart(6)} | ${String(rh).padStart(3)} | ${String(expected).padStart(5)}% | ${String(ours).padStart(5)}% | ${diff.toFixed(1)}${diff > 0.5 ? " FAIL" : ""}`
  );
}

console.log(`\nMax deviation: ${maxDiff.toFixed(1)}%`);
console.log(`Failed (>0.5% deviation): ${failCount} / ${usdaTable.length}`);
console.log(`Result: ${failCount === 0 ? "PASS" : "FAIL"}`);
console.log("\nReference:  USDA FPL Wood Handbook (FPL-GTR-282), Chapter 4, Table 4-2");
console.log("Cross-check: https://www.wagnermeters.com/moisture-meters/wood-moisture-calculator/");

process.exit(failCount > 0 ? 1 : 0);
