import { readFileSync, appendFileSync, existsSync } from "fs";

const CSV_FILE = "humidity_log.csv";

function ensureCsvHeader() {
  if (!existsSync(CSV_FILE)) {
    appendFileSync(CSV_FILE, "timestamp,project,city,humidity_pct\n");
  }
}

async function fetchHourlyHumidity(latitude, longitude, startDate, endDate) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&hourly=relative_humidity_2m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} for ${latitude},${longitude}`);
  const data = await res.json();
  return data.hourly;
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node history.js <start-date> <end-date>");
    console.error("Dates in YYYY-MM-DD format, e.g. node history.js 2026-05-01 2026-06-10");
    process.exit(1);
  }
  return { start: args[0], end: args[1] };
}

async function main() {
  const { start, end } = parseArgs();
  const cities = JSON.parse(readFileSync("cities.json", "utf-8"));
  ensureCsvHeader();

  let totalRows = 0;

  for (const { project, city, latitude, longitude } of cities) {
    try {
      console.log(`Fetching ${city} (${start} to ${end})...`);
      const hourly = await fetchHourlyHumidity(latitude, longitude, start, end);
      const rows = hourly.time.map((t, i) => {
        const humidity = hourly.relative_humidity_2m[i];
        return humidity !== null ? `${t.replace("T", " ")},${project},${city},${humidity}` : null;
      }).filter(Boolean);
      appendFileSync(CSV_FILE, rows.join("\n") + "\n");
      totalRows += rows.length;
      console.log(`  ${rows.length} hourly readings saved`);
    } catch (err) {
      console.error(`  Failed for ${city}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${totalRows} total readings saved to ${CSV_FILE}`);
}

main();
