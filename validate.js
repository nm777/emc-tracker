import { readFileSync } from "fs";

function calcEMC(rh, tempC) {
  const T = tempC;
  const h = rh / 100;
  const W = 349 + 1.29 * T + 0.0135 * T * T;
  const k = 0.805 + 0.000736 * T - 0.00000273 * T * T;
  const k1 = 6.27 - 0.00938 * T - 0.000303 * T * T;
  const k2 = 1.91 + 0.0407 * T - 0.000293 * T * T;
  const kh = k * h;
  const t1 = kh / (1 - kh);
  const num2 = k1 * kh + 2 * k1 * k2 * k * kh * h;
  const den2 = 1 + k1 * kh + k1 * k2 * k * kh * h;
  const t2 = num2 / den2;
  return Number(((1800 / W) * (t1 + t2)).toFixed(1));
}

// USDA FPL Wood Handbook Table 4-2 reference values
// [tempF, RH%, expected EMC%]
const usdaTable = [
  [40,  30, 6.3], [40,  50, 9.6], [40,  65, 12.0], [40,  80, 15.9], [40,  90, 21.0],
  [60,  30, 6.1], [60,  50, 9.3], [60,  65, 11.7], [60,  80, 15.6], [60,  90, 20.6],
  [70,  30, 6.0], [70,  50, 9.2], [70,  65, 11.6], [70,  80, 15.5], [70,  90, 20.5],
  [80,  30, 5.9], [80,  50, 9.1], [80,  65, 11.5], [80,  80, 15.3], [80,  90, 20.3],
  [100, 30, 5.8], [100, 50, 8.8], [100, 65, 11.2], [100, 80, 14.9], [100, 90, 19.8],
];

console.log("=== EMC Formula Validation ===");
console.log("Comparing against USDA FPL Wood Handbook Table 4-2");
console.log("Formula: Hailwood-Horrobin (2-hydrate model), T in C\n");

let maxDiff = 0;
let allPass = true;

console.log("Temp F | RH% | USDA   | Ours   | Diff");
console.log("-------|-----|--------|--------|------");

for (const [tempF, rh, expected] of usdaTable) {
  const tempC = (tempF - 32) * 5 / 9;
  const ours = calcEMC(rh, tempC);
  const diff = Math.abs(ours - expected);
  maxDiff = Math.max(maxDiff, diff);
  if (diff > 0.5) allPass = false;
  console.log(
    `${String(tempF).padStart(6)} | ${String(rh).padStart(3)} | ${String(expected).padStart(5)}% | ${String(ours).padStart(5)}% | ${diff.toFixed(1)}${diff > 0.5 ? " FAIL" : ""}`
  );
}

console.log(`\nMax deviation: ${maxDiff.toFixed(1)}%`);
console.log(`All within +/-0.5% tolerance: ${allPass ? "PASS" : "FAIL"}`);

if (process.argv[2] === "--csv" && typeof require !== "undefined") {
  console.log("\n=== CSV Spot-check ===\n");
  try {
    const lines = readFileSync("humidity_log.csv", "utf-8").trim().split("\n").slice(1);
    const buckets = { "0-2% (safe)": 0, "2-5% (caution)": 0, "5-8% (risk)": 0, ">8% (extreme)": 0 };
    for (const line of lines) {
      const s = parseFloat(line.split(",")[6]);
      if (s <= 2) buckets["0-2% (safe)"]++;
      else if (s <= 5) buckets["2-5% (caution)"]++;
      else if (s <= 8) buckets["5-8% (risk)"]++;
      else buckets[">8% (extreme)"]++;
    }
    for (const [label, count] of Object.entries(buckets)) {
      console.log(`  ${label}: ${count} days`);
    }
  } catch {}
}

console.log("\nCross-check: https://www.wagnermeters.com/moisture-meters/wood-moisture-calculator/");
console.log("Reference:  USDA FPL Wood Handbook (FPL-GTR-282), Chapter 4, Table 4-2");
