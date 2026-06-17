import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { createServer } from "http";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

process.on("uncaughtException", (err) => console.error("UNCAUGHT:", err));
process.on("unhandledRejection", (err) => console.error("UNHANDLED REJECTION:", err));

const MIMES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".csv": "text/csv",
  ".css": "text/css",
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext = extname(filePath);
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIMES[ext] || "text/plain" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function calcEMC(rh, tempC) {
  const T = tempC, h = rh / 100;
  const W = 349 + 1.29 * T + 0.0135 * T * T;
  const k = 0.805 + 0.000736 * T - 0.00000273 * T * T;
  const k1 = 6.27 - 0.00938 * T - 0.000303 * T * T;
  const k2 = 1.91 + 0.0407 * T - 0.000293 * T * T;
  const kh = k * h;
  const t1 = kh / (1 - kh);
  const num2 = k1 * kh + 2 * k1 * k2 * k * kh * h;
  const den2 = 1 + k1 * kh + k1 * k2 * k * kh * h;
  return Number(((1800 / W) * (t1 + num2 / den2)).toFixed(1));
}

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

function drain(req) {
  return new Promise((resolve) => {
    req.resume();
    req.on("end", resolve);
  });
}

function regenerateDataJs(cities) {
  const csvFile = join(__dirname, "emc_log.csv");
  if (!existsSync(csvFile)) return;
  const dateRange = {};
  for (const c of cities) {
    dateRange[c.project] = { start: c.start_date, end: c.end_date };
  }
  const lines = readFileSync(csvFile, "utf-8").trim().split("\n").slice(1);
  const byProject = {};
  for (const line of lines) {
    const parts = parseCsvLine(line);
    const [date, proj, c, min, max, avg, swing] = parts;
    const range = dateRange[proj];
    if (range && range.start && date < range.start) continue;
    if (range && range.end && date > range.end) continue;
    if (!byProject[proj]) byProject[proj] = { city: c, days: [] };
    byProject[proj].days.push({ date, min: +min, max: +max, avg: +avg, swing: +swing });
  }
  for (const proj in byProject) {
    byProject[proj].days.sort((a, b) => a.date.localeCompare(b.date));
  }
  writeFileSync(join(__dirname, "data.js"), `window.HUMIDITY_DATA = ${JSON.stringify(byProject)};`);
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, { status: "ok", time: new Date().toISOString() });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return serveStatic(res, join(__dirname, "index.html"));
  }

  if (req.method === "GET" && url.pathname === "/api/cities") {
    try {
      const cities = JSON.parse(readFileSync(join(__dirname, "cities.json"), "utf-8"));
      return json(res, cities);
    } catch (err) {
      return json(res, { error: err.message }, 500);
    }
  }

  if (req.method === "POST" && url.pathname === "/api/cities") {
    readBody(req).then((body) => {
      try {
        const data = JSON.parse(body);
        writeFileSync(join(__dirname, "cities.json"), JSON.stringify(data, null, 2) + "\n");
        regenerateDataJs(data);
        json(res, { ok: true });
      } catch (err) {
        json(res, { error: err.message }, 500);
      }
    }).catch((err) => json(res, { error: err.message }, 500));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/collect") {
    (async () => {
      try {
        await drain(req);

        const cities = JSON.parse(readFileSync(join(__dirname, "cities.json"), "utf-8"));
        const CSV_FILE = join(__dirname, "emc_log.csv");

        if (!existsSync(CSV_FILE)) {
          appendFileSync(CSV_FILE, "date,project,city,min_emc,max_emc,avg_emc,swing,min_rh,max_rh,avg_rh,min_temp,max_temp,avg_temp\n");
        }

        const lines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1);
        const bounds = {};
        for (const line of lines) {
          const parts = parseCsvLine(line);
          const project = parts[1];
          const date = parts[0];
          if (!bounds[project]) {
            bounds[project] = { first: date, last: date };
          } else {
            if (date < bounds[project].first) bounds[project].first = date;
            if (date > bounds[project].last) bounds[project].last = date;
          }
        }

        const today = new Date().toISOString().slice(0, 10);
        let totalRows = 0;
        const logs = [];

        for (const { project, city, latitude, longitude, start_date, end_date } of cities) {
          const b = bounds[project];
          const endDate = end_date && end_date < today ? end_date : today;

          const gaps = [];
          if (b) {
            if (start_date && start_date < b.first) {
              const d = new Date(b.first);
              d.setDate(d.getDate() - 1);
              gaps.push([start_date, d.toISOString().slice(0, 10)]);
            }
            const d = new Date(b.last);
            d.setDate(d.getDate() + 1);
            const fwdStart = d.toISOString().slice(0, 10);
            if (fwdStart <= endDate) {
              gaps.push([fwdStart, endDate]);
            }
          } else if (start_date && start_date <= endDate) {
            gaps.push([start_date, endDate]);
          }

          if (gaps.length === 0) {
            logs.push(`${city} (${project}): up to date, skipping`);
            continue;
          }

          for (const [gapStart, gapEnd] of gaps) {
            logs.push(`${city} (${project}): fetching ${gapStart} to ${gapEnd}...`);

            try {
              const api = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${gapStart}&end_date=${gapEnd}&hourly=relative_humidity_2m,temperature_2m&timezone=auto`;
              const resp = await fetch(api);
              if (!resp.ok) throw new Error(`API error: ${resp.status}`);
              const hourly = (await resp.json()).hourly;

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

              const sum = (arr) => arr.reduce((a, b) => a + b, 0);
              const stat = (arr) => ({
                min: Math.min(...arr),
                max: Math.max(...arr),
                avg: Number((sum(arr) / arr.length).toFixed(1)),
              });

              const rows = Object.entries(byDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, vals]) => {
                  const emc = stat(vals.emc);
                  const rh = stat(vals.rh);
                  const tmp = stat(vals.temp);
                  return `${date},${csvVal(project)},${csvVal(city)},${emc.min},${emc.max},${emc.avg},${Number((emc.max - emc.min).toFixed(1))},${rh.min},${rh.max},${rh.avg},${Number(tmp.min.toFixed(1))},${Number(tmp.max.toFixed(1))},${tmp.avg}`;
                });

              if (rows.length > 0) {
                appendFileSync(CSV_FILE, rows.join("\n") + "\n");
                totalRows += rows.length;
                logs.push(`  ${rows.length} daily summaries saved`);
              }
            } catch (err) {
              logs.push(`  failed: ${err.message}`);
            }
          }
        }

        regenerateDataJs(cities);

        logs.push(`\nDone. ${totalRows} total rows saved.`);
        console.log("Collect completed:", logs.join(" | "));
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(logs.join("\n"));
      } catch (err) {
        console.error("Collect error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
        }
        res.end("Error: " + err.message);
      }
    })();
    return;
  }

  const filePath = join(__dirname, url.pathname.slice(1));
  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`EMC Tracker running at http://localhost:${PORT}`);
});
