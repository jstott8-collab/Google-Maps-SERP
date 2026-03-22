# GBP Rank Tracker — Free Google Maps Rank Checker & Local SEO Grid Tool

**Track your Google Business Profile rankings across a geographic grid. See exactly where you rank #1 and where you disappear — from every location in your service area.**

GBP Rank Tracker is a free, open-source local SEO rank tracking tool that shows how your Google Maps rankings change based on searcher location. Unlike single-point rank checkers, it creates a grid of dozens of virtual vantage points and checks your Google Maps position from each one — giving you a complete geographic ranking heatmap.

[![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/danishfareed/Google-Maps-SERP/releases/latest)
[![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/danishfareed/Google-Maps-SERP/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

![GBP Rank Tracker Dashboard — Google Maps Rank Grid](https://github.com/danishfareed/Google-Maps-SERP/blob/main/public/preview.png?raw=true)

---

## Why GBP Rank Tracker?

Google Maps rankings are **hyperlocal** — a business might rank #1 when searched from 2 blocks away but rank #15 from 5 miles out. Standard rank trackers only check from one location and miss this entirely.

GBP Rank Tracker solves this by:

- Creating a **grid of geographic checkpoints** (3x3 up to 13x13) around your target area
- Running a **real Google Maps search from each point** using browser automation
- Mapping results into a **color-coded ranking heatmap** so you can instantly see your strong zones vs. blind spots
- Tracking **every competitor** in the top 20 at each grid point — not just your position

**No API keys. No monthly fees. No data leaves your machine.** Everything runs locally on your computer.

---

## Desktop App — One-Click Install

No terminal. No localhost. No Node.js setup. Just download, install, and start tracking.

| Platform | Download | Size |
|----------|----------|------|
| **macOS** | [Download DMG](https://github.com/danishfareed/Google-Maps-SERP/releases/latest) | ~190 MB |
| **Windows** | [Download Installer](https://github.com/danishfareed/Google-Maps-SERP/releases/latest) | ~190 MB |

> **Windows users:** SmartScreen may show a warning because the app isn't code-signed yet. Click **"More info"** then **"Run anyway"** to proceed. The app is fully open-source — you can inspect every line of code.

> **macOS users:** If you see "app is damaged" or "unidentified developer", right-click the app and select **Open**, then click **Open** in the dialog.

**Auto-updates included** — the app checks for new versions automatically and notifies you when an update is available.

---

## Features

### Google Maps Rank Tracking Grid
- **Grid-based local rank tracking** — 3x3 to 13x13 grids with square, circle, ZIP code, or smart grid modes
- **Real browser-based rank checking** — uses actual Google Maps, not third-party APIs
- **Track any keyword** — "plumber near me", "best pizza", "dentist", any Google Maps search term
- **Multi-run history** — track ranking changes over time with timeline comparisons
- **Scheduled scans** — daily or weekly automated rank checks
- **Competitor analysis** — see which businesses dominate each area of the map

### Google Reviews Analyzer
- **Scrape all Google reviews** for any business — hundreds or thousands of reviews
- **AI-powered sentiment analysis** — understand what customers love and hate
- **Fake review detection** — flag suspicious review patterns, velocity spikes, low-effort reviews
- **150+ metrics** — rating trends, response rates, seasonal patterns, keyword extraction
- **Review export** — XLSX, PDF, JSON, CSV export formats

### Intelligence Dashboard
- **Market share analysis** — Herfindahl-Hirschman Index (HHI) for competitive concentration
- **Share of Voice** — which businesses dominate the search results overall
- **Geographic heatmaps** — color-coded grid pins (green = top 3, orange = 4-10, red = 11-20)
- **Competitor threat scoring** — automatic identification of your biggest ranking threats
- **Rank change alerts** — get notified when your rankings move up or down

### Enterprise Features
- **Proxy support** — configure proxy pools with automatic failover and dead proxy detection
- **Bulk proxy import** — fetch free proxies from 4 sources and auto-test them
- **Export reports** — multi-tab Excel workbooks, PDF reports with charts, JSON data exports
- **Grid presets** — save and reuse grid configurations for recurring audits
- **Business profiles** — save frequently tracked businesses for quick access
- **System logging** — full diagnostic telemetry for troubleshooting
- **Offline postal code database** — 1.8M+ postal codes across 121 countries for ZIP-based grids

---

## How It Works

```
1. Enter your business name or Google Maps URL
2. Choose a keyword (e.g., "plumber near me")
3. Configure your grid (size, shape, radius)
4. Click "Run Scan"
```

The tool creates virtual search points across your service area, performs real Google Maps searches from each location, and maps the results:

```
  🟢 = Rank 1-3    🟡 = Rank 4-10    🔴 = Rank 11-20    ⚫ = Not found
```

Each grid point captures the full top-20 SERP, so you get complete competitive intelligence — not just your own position.

---

## Run from Source (Developer Setup)

If you prefer running from source instead of the desktop app:

### Prerequisites
- **Node.js v18+** — [nodejs.org](https://nodejs.org/)
- **Git** — [git-scm.com](https://git-scm.com/)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/danishfareed/Google-Maps-SERP.git
cd Google-Maps-SERP

# Install dependencies
npm install

# Install browser engine
npx playwright install chromium

# Start the app
npm run dev
```

Then open **http://localhost:3000** in your browser.

### One-Click Install Scripts

**macOS:**
```bash
./install_mac.sh    # First-time setup
./start.sh          # Launch the app
./update_mac.sh     # Update to latest version
```

**Windows:**
```powershell
install_windows.bat   # First-time setup
start.bat             # Launch the app
update_windows.bat    # Update to latest version
```

---

## Privacy & Data Ownership

GBP Rank Tracker runs **100% locally on your machine**:

- All data stored in a local SQLite database
- No external APIs see your keywords or rankings
- No telemetry, analytics, or tracking
- No account required
- No API keys needed
- Your competitive intelligence stays yours

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js (App Router) |
| Frontend | React, Tailwind CSS 4, Framer Motion |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts |
| Database | SQLite (Prisma ORM) |
| Browser Automation | Playwright |
| NLP | wink-nlp, VADER sentiment |
| Desktop | Electron + electron-updater |
| Export | ExcelJS, jsPDF |

---

## Use Cases

- **Local SEO agencies** — audit client rankings across their entire service area
- **Multi-location businesses** — compare ranking performance across locations
- **Service area businesses (SABs)** — understand where you're visible vs. invisible
- **Competitive research** — map out which competitors own which neighborhoods
- **Before/after SEO audits** — measure the geographic impact of optimization work
- **Google Business Profile optimization** — identify which areas need more reviews, posts, or citations

---

## Screenshots

| Rank Grid Map | Review Analysis | Competitor Intelligence |
|:---:|:---:|:---:|
| Color-coded geographic ranking grid | AI-powered review sentiment breakdown | Market share & threat analysis |

---

## Contributing

Contributions are welcome! This is an open-source project and community improvements make it better for everyone.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

**Author:** [Danish Fareed](https://github.com/danishfareed)
**Website:** [vdesignu.com](https://vdesignu.com)

---

## Related Keywords

Google Maps rank tracker, local SEO tool, GBP rank checker, Google Business Profile ranking, local rank grid, geo-grid rank tracker, Google Maps SERP checker, local search rank tracking, hyperlocal SEO tool, Google Maps position checker, GMB ranking tool, local pack tracker, map pack rank checker, Google Maps competitor analysis, local SEO audit tool, Google reviews analyzer, review sentiment analysis, fake review detector, free local SEO software, open source rank tracker
