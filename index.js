import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";

const CSV_FILE = "emc_log.csv";

const CSV_HEADER = "date,project,city,min_emc,max_emc,avg_emc,swing,min_rh,max_rh,avg_rh,min_temp,max_temp,avg_temp\n";

function csvVal(v) {
  if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function ensureCsvHeader() {
  if (!existsSync(CSV_FILE)) {
    appendFileSync(CSV_FILE, CSV_HEADER);
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
    if (!byDate[date]) byDate[date] = { emc: [], rh: [], temp: [] };
    byDate[date].emc.push(calcEMC(rh, temp));
    byDate[date].rh.push(rh);
    byDate[date].temp.push(temp);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => {
      const sum = (arr) => arr.reduce((a, b) => a + b, 0);
      const stat = (arr) => ({
        min: Math.min(...arr),
        max: Math.max(...arr),
        avg: Number((sum(arr) / arr.length).toFixed(1)),
      });
      const emc = stat(vals.emc);
      const rh = stat(vals.rh);
      const temp = stat(vals.temp);
      return {
        date,
        min_emc: emc.min, max_emc: emc.max, avg_emc: emc.avg,
        swing: Number((emc.max - emc.min).toFixed(1)),
        min_rh: rh.min, max_rh: rh.max, avg_rh: rh.avg,
        min_temp: Number(temp.min.toFixed(1)), max_temp: Number(temp.max.toFixed(1)), avg_temp: temp.avg,
      };
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

  for (const { project, city, latitude, longitude, start_date, end_date } of cities) {
    const lastDate = lastByProject[project];
    const startDate = getFetchStart(lastDate, start_date);
    const endDate = end_date && end_date < today ? end_date : today;

    if (startDate > endDate) {
      console.log(`${city} (${project}): up to date, skipping`);
      continue;
    }

    const label = lastDate
      ? `gap-fill from ${startDate}`
      : `initial fetch from ${start_date}`;
    console.log(`${city} (${project}): ${label}...`);

    try {
      const hourly = await fetchHourly(latitude, longitude, startDate, endDate);
      const daily = aggregateToDaily(hourly);
      const rows = daily.map(d => `${d.date},${csvVal(project)},${csvVal(city)},${d.min_emc},${d.max_emc},${d.avg_emc},${d.swing},${d.min_rh},${d.max_rh},${d.avg_rh},${d.min_temp},${d.max_temp},${d.avg_temp}`);

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
    const parts = parseCsvLine(line);
    const [date, project, city, min, max, avg, swing] = parts;
    if (!byProject[project]) byProject[project] = { city, days: [] };
    byProject[project].days.push({ date, min: +min, max: +max, avg: +avg, swing: +swing });
  }
  writeFileSync("data.js", `window.HUMIDITY_DATA = ${JSON.stringify(byProject)};`);
}

export { calcEMC, aggregateToDaily, CSV_FILE, CSV_HEADER };

if (process.argv[1] && (process.argv[1].endsWith("index.js") || process.argv[1].endsWith("index"))) {
  main();
}
