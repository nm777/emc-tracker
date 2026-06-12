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

function drain(req) {
  return new Promise((resolve) => {
    req.resume();
    req.on("end", resolve);
  });
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
        const CSV_FILE = join(__dirname, "humidity_log.csv");

        if (!existsSync(CSV_FILE)) {
          appendFileSync(CSV_FILE, "date,project,city,min_emc,max_emc,avg_emc,swing\n");
        }

        const lines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1);
        const lastByProject = {};
        for (const line of lines) {
          const parts = line.split(",");
          const project = parts[1];
          const date = parts[0];
          if (!lastByProject[project] || date > lastByProject[project]) lastByProject[project] = date;
        }

        const today = new Date().toISOString().slice(0, 10);
        let totalRows = 0;
        const logs = [];

        for (const { project, city, latitude, longitude, start_date } of cities) {
          const lastDate = lastByProject[project];
          let startDate;
          if (lastDate) {
            const d = new Date(lastDate);
            d.setDate(d.getDate() + 1);
            startDate = d.toISOString().slice(0, 10);
          } else {
            startDate = start_date;
          }

          if (startDate > today) {
            logs.push(`${city} (${project}): up to date, skipping`);
            continue;
          }

          logs.push(`${city} (${project}): ${lastDate ? "gap-fill" : "initial"} from ${startDate}...`);

          try {
            const api = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${today}&hourly=relative_humidity_2m,temperature_2m&timezone=auto`;
            const resp = await fetch(api);
            if (!resp.ok) throw new Error(`API error: ${resp.status}`);
            const hourly = (await resp.json()).hourly;

            const byDate = {};
            for (let i = 0; i < hourly.time.length; i++) {
              const rh = hourly.relative_humidity_2m[i];
              const temp = hourly.temperature_2m[i];
              if (rh === null || temp === null) continue;
              const date = hourly.time[i].slice(0, 10);
              if (!byDate[date]) byDate[date] = [];
              byDate[date].push(calcEMC(rh, temp));
            }

            const rows = Object.entries(byDate)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, vals]) => {
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const avg = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
                return `${date},${project},${city},${min},${max},${avg},${Number((max - min).toFixed(1))}`;
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

        const allLines = readFileSync(CSV_FILE, "utf-8").trim().split("\n").slice(1);
        const byProject = {};
        for (const line of allLines) {
          const [date, proj, c, min, max, avg, swing] = line.split(",");
          if (!byProject[proj]) byProject[proj] = { city: c, days: [] };
          byProject[proj].days.push({ date, min: +min, max: +max, avg: +avg, swing: +swing });
        }
        writeFileSync(join(__dirname, "data.js"), `window.HUMIDITY_DATA = ${JSON.stringify(byProject)};`);

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
