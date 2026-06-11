import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";

const CSV_FILE = "humidity_log.csv";

function ensureCsvHeader() {
  if (!existsSync(CSV_FILE)) {
    appendFileSync(CSV_FILE, "date,project,city,min,max,avg\n");
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

function aggregateToDaily(hourly) {
  const byDate = {};
  for (let i = 0; i < hourly.time.length; i++) {
    const h = hourly.relative_humidity_2m[i];
    if (h === null) continue;
    const date = hourly.time[i].slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(h);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
    }));
}

async function fetchHourlyHumidity(latitude, longitude, startDate, endDate) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&hourly=relative_humidity_2m&timezone=auto`;
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
      const hourly = await fetchHourlyHumidity(latitude, longitude, startDate, today);
      const daily = aggregateToDaily(hourly);
      const rows = daily.map(d => `${d.date},${project},${city},${d.min},${d.max},${d.avg}`);

      if (rows.length > 0) {
        appendFileSync(CSV_FILE, rows.join("\n") + "\n");
        totalRows += rows.length;
        console.log(`  ${rows.length} daily summaries saved`);
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
    const [date, project, city, min, max, avg] = line.split(",");
    if (!byProject[project]) byProject[project] = { city, days: [] };
    byProject[project].days.push({ date, min: +min, max: +max, avg: +avg });
  }
  writeFileSync("data.js", `window.HUMIDITY_DATA = ${JSON.stringify(byProject)};`);
}

main();
