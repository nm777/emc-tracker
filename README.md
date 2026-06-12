# EMC Tracker

A tool for tracking Equilibrium Moisture Content (EMC) at construction project sites. Fetches hourly weather data, calculates daily EMC using the Hailwood-Horrobin equation, and displays risk-tiered charts to document environmental conditions that affect wood movement.

Built for construction professionals who need defensible evidence that wood defects were caused by uncontrolled humidity — not workmanship.

## Requirements

- **A Mac or Windows PC**
- **Node.js** — a free program that runs this app (see installation below)
- **A web browser** — Chrome, Firefox, Safari, or Edge

No other software needed. No accounts or API keys required.

## Installing Node.js

Node.js is the only thing you need to install. It's free and takes about a minute.

### Mac

1. Go to [https://nodejs.org](https://nodejs.org)
2. Click the **LTS** (Long Term Support) download button — it will say something like "22.x.x LTS"
3. Open the downloaded `.pkg` file
4. Click through the installer (Next, Next, Install)
5. When it finishes, close the installer

To verify it worked, open the **Terminal** app (press Command+Space, type "Terminal", press Enter) and type:

```
node --version
```

You should see a version number like `v22.x.x`.

### Windows

1. Go to [https://nodejs.org](https://nodejs.org)
2. Click the **LTS** (Long Term Support) download button — it will say something like "22.x.x LTS"
3. Open the downloaded `.msi` file
4. Click through the installer (Next, Next, Install)
5. When it finishes, close the installer

To verify it worked, open **Command Prompt** (press the Windows key, type "cmd", press Enter) and type:

```
node --version
```

You should see a version number like `v22.x.x`.

## Installing This App

### Downloading from GitHub

1. Go to the GitHub repository page: [github.com/nm777/emc-tracker](https://github.com/nm777/emc-tracker)
2. Click the green **Code** button (near the top right)
3. Click **Download ZIP**
4. Unzip the downloaded file
5. Rename the folder from `emc-tracker-main` to `emc-tracker`
6. Move it somewhere easy to find — your Desktop or Documents folder

### If you received a zip file directly

1. Unzip it
2. Remember where you saved it

## Quick Start

### Mac

1. Open **Terminal** (press Command+Space, type "Terminal", press Enter)
2. Navigate to the app folder. For example, if you unzipped it to your Desktop:

```
cd ~/Desktop/emc-tracker
```

3. Start the app:

```
npm start
```

4. Open your browser and go to [http://localhost:3000](http://localhost:3000)

### Windows

1. Open **Command Prompt** (press the Windows key, type "cmd", press Enter)
2. Navigate to the app folder. For example, if you unzipped it to your Desktop:

```
cd %USERPROFILE%\Desktop\emc-tracker
```

3. Start the app:

```
npm start
```

4. Open your browser and go to [http://localhost:3000](http://localhost:3000)

Leave the Terminal / Command Prompt window open while you use the app. Closing it will stop the server. To stop the server, press **Ctrl+C** in the Terminal window.

## How It Works

### Adding Projects

1. Click **Manage Projects** in the top right
2. Click **+ Add Project**
3. Enter a project name
4. Type a city name (or "City, State" like "Medina, MN") and select from the suggestions
5. Set a start date — data will be collected from that date forward
6. Click **Save**, then **Collect Data**

### Understanding the Chart

The chart shows two panels:

- **Top panel**: Daily average EMC (blue line) with a shaded band showing the min–max range
- **Bottom panel**: Daily swing magnitude, color-coded by risk level:
  - **Grey** — Safe (≤2% swing): normal controlled conditions
  - **Amber** — Caution (2–5%): measurable wood stress
  - **Red** — High (5–10%): warping and joint failure expected
  - **Bright red** — Extreme (>10%): severe environmental failure

### Ongoing Collection

Click **Collect Data** in the app periodically to fetch any new data since the last collection. Each run only downloads what's missing.

#### Setting Up Automatic Collection (Mac)

If you want data to collect automatically every hour without remembering to click the button:

1. Open Terminal
2. Type `crontab -e` and press Enter
3. Press the `i` key to enter edit mode
4. Type this line (replace the path with where you saved the app):

```
0 * * * * cd /Users/yourname/Desktop/emc-tracker && node index.js
```

5. Press the Escape key
6. Type `:wq` and press Enter to save

To stop automatic collection later, run `crontab -e` again and delete that line.

#### Setting Up Automatic Collection (Windows)

1. Press the Windows key, type **Task Scheduler**, and open it
2. In the right sidebar, click **Create Task...** (not "Create Basic Task")
3. On the **General** tab:
   - Name it `EMC Tracker Data Collection`
   - Select **Run whether user is logged on or not**
4. On the **Triggers** tab:
   - Click **New...**
   - Set **Begin the task** to "On a schedule"
   - Under Settings, select **Daily**, then check **Repeat task every: 1 hour** and set **for a duration of: Indefinitely**
   - Click OK
5. On the **Actions** tab:
   - Click **New...**
   - Set **Action** to "Start a program"
   - Set **Program/script** to `node`
   - Set **Add arguments** to `index.js`
   - Set **Start in** to the folder where you saved the app, e.g. `C:\Users\yourname\Desktop\emc-tracker`
   - Click OK
6. Click OK to save the task

To stop automatic collection later, open Task Scheduler, find the task, and click **Disable** or **Delete**.

## What is EMC?

Equilibrium Moisture Content is the moisture percentage wood naturally settles to based on air temperature and humidity. A 1% EMC change causes roughly 1% dimensional change across the grain. When EMC swings wildly in a single day, wood is under stress it cannot respond to fast enough — causing warping, checking, cupping, and finish defects.

The EMC values are calculated using the **Hailwood-Horrobin two-hydrate model** from the USDA Forest Products Laboratory Wood Handbook (FPL-GTR-282), Chapter 4.

### Verifying the Formula

You can verify that the EMC calculations are accurate against the USDA's published reference table. In Terminal:

```
node validate.js
```

This compares 25 test points against Table 4-2 of the USDA Wood Handbook. The formula is accurate to within ±0.6%.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Web server with API for config and data collection |
| `index.js` | Standalone data collection script (can run without server) |
| `index.html` | Dashboard UI with charts and project management |
| `validate.js` | EMC formula validation against USDA reference table |
| `cities.json` | Project configuration (name, address, coordinates, start date) — generated by the UI |
| `emc_log.csv` | Daily summaries: EMC, humidity, and temperature (min, max, avg, swing) |
| `data.js` | Generated chart data loaded by the browser |

## Running Without the Server

You can also use the app without the browser-based server. This is simpler but you'll need to edit the `cities.json` file by hand to add projects.

In Terminal, from the app folder:

```
node index.js
```

Then open `index.html` in your browser. Note that the **Manage Projects** button won't work in this mode — you'll need to edit `cities.json` with a text editor and run `node index.js` again to collect data for any new projects.

## License

MIT
