import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";

const CSV_FILE = "humidity_log.csv";

function ensureCsvHeader() {
  if (!existsSync(CSV_FILE)) {
    appendFileSync(CSV_FILE, "date,project,city,min_emc,max_emc,avg_emc,swing\n");
  }
}

function getLastDates() {
  if (!existsSync(CSV_FILE)) return {};
  const lines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1);
  const lastByProject = {};
  for (const line of lines) {
    const parts = line.split(",");
    const project = parts[1];
    const date = parts[0];
    if (!lastByProject[project] || date > lastByProject[project]) {
      lastByProject[project] = date;
    }
  }
  return lastByProject;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function getFetchStart(lastDate, cityStartDate) {
  if (lastDate) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }
  return cityStartDate;
}

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

function aggregateToDaily(hourly) {
  const byDate = {};
  for (let i = 0; i < hourly.time.length; i++) {
    const rh = hourly.relative_humidity_2m[i];
    const temp = hourly.temperature_2m[i];
    if (rh === null || temp === null) continue;
    const date = hourly.time[i].slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(calcEMC(rh, temp));
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
      return { date, min, max, avg, swing: Number((max - min).toFixed(1)) };
    });
}

async function fetchHourly(latitude, longitude, startDate, endDate) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&hourly=relative_humidity_2m,temperature_2m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} for ${latitude},${longitude}`);
  return (await res.json()).hourly;
}

async function main() {
  const cities = JSON.parse(readFileSync("cities.json", "utf-8"));
  ensureCsvHeader();
  const lastByProject = getLastDates();
  const today = toDateStr(new Date());
  let totalRows = 0;

  for (const { project, city, latitude, longitude, start_date } of cities) {
    const lastDate = lastByProject[project];
    const startDate = getFetchStart(lastDate, start_date);

    if (startDate > today) {
      console.log(`${city} (${project}): up to date, skipping`);
      continue;
    }

    const label = lastDate
      ? `gap-fill from ${startDate}`
      : `initial fetch from ${start_date}`;
    console.log(`${city} (${project}): ${label}...`);

    try {
      const hourly = await fetchHourly(latitude, longitude, startDate, today);
      const daily = aggregateToDaily(hourly);
      const rows = daily.map(d => `${d.date},${project},${city},${d.min},${d.max},${d.avg},${d.swing}`);

      if (rows.length > 0) {
        appendFileSync(CSV_FILE, rows.join("\n") + "\n");
        totalRows += rows.length;
        console.log(`  ${rows.length} daily EMC summaries saved`);
      } else {
        console.log(`  no new data available`);
      }
    } catch (err) {
      console.error(`  failed: ${err.message}`);
    }
  }

  writeDataJs();
  console.log(`\nDone. ${totalRows} total rows saved to ${CSV_FILE}`);
}

function writeDataJs() {
  if (!existsSync(CSV_FILE)) return;
  const lines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1);
  const byProject = {};
  for (const line of lines) {
    const [date, project, city, min, max, avg, swing] = line.split(",");
    if (!byProject[project]) byProject[project] = { city, days: [] };
    byProject[project].days.push({ date, min: +min, max: +max, avg: +avg, swing: +swing });
  }
  writeFileSync("data.js", `window.HUMIDITY_DATA = ${JSON.stringify(byProject)};`);
}

main();
