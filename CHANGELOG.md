# Changelog

All notable changes to this project will be documented in this file.

## [1.8.1] - 2026-03-22

### Review Module Reliability Overhaul (1000+ Reviews)

Deep analysis and fix of the entire review pipeline to handle businesses with 1000+ reviews reliably.

#### Fixed
- **Stall Detection Bug (CRITICAL)** — `networkReviews.size` was compared against `lastDOMCount` instead of `lastNetworkCount`, causing false stall triggers that terminated scraping prematurely. Network and DOM counts are now tracked independently.
- **Scroll Speed Too Slow** — Base scroll delay for 1000+ reviews reduced from 2500ms to 1500ms. Faster delays across all tiers (600/800/1000/1200/1500ms vs 800/1200/1500/2000/2500ms). This ~doubles throughput for large collections.
- **Adaptive Timeout** — Global timeout now scales with expected review count: 45 min (< 500 reviews), 90 min (500–1000), 120 min (1000+). Previously hardcoded at 45 min for all sizes.
- **Max Scroll Attempts Increased** — From `expectedTotal × 4` (cap 6000) to `expectedTotal × 5` (cap 8000), giving more runway for large collections.
- **Proactive "Load More" Button** — Now clicks Google's "Load More" button every 8 scroll cycles during normal operation. Previously only clicked during stall recovery, missing reviews that required explicit loading.
- **One-by-One DB Inserts (CRITICAL)** — Both POST and rerun routes were inserting reviews one at a time (1000 INSERT statements for 1000 reviews). Replaced with multi-row batch INSERTs (50 per statement), reducing DB round-trips by 98%.
- **Rerun Sentiment Updates Not Batched** — Rerun route was updating sentiment scores one-by-one via raw SQL. Replaced with Prisma `$transaction` batches of 50, matching the POST route pattern.
- **Stuck SCRAPING/ANALYZING Status** — POST route catch block now marks the analysis as FAILED with error message, preventing permanently stuck records.
- **No Server-Side Pagination** — Review detail GET now supports `?page=N&limit=N` query params (default: page 1, 200 per page). Returns `pagination` object with `total`, `totalPages`, `hasMore`. Use `limit=0` for all reviews (backwards compatible).

---

## [1.8.0] - 2026-03-22

### Competitive Intelligence & Analytics Platform

Major feature release adding 10 new API endpoints and infrastructure to match and exceed paid Local SEO SaaS tools (Local Falcon, BrightLocal, Whitespark).

#### New Features
- **Webhook System** — Full CRUD API (`/api/webhooks`) with HMAC-SHA256 signed payloads. Events: `SCAN_COMPLETE`, `RANK_CHANGE`, `SCAN_FAILED`, `REVIEW_COMPLETE`. Fire-and-forget dispatcher integrated into scanner completion, rank change alerts, and failure handler.
- **Share of Voice (SOV)** — `/api/scans/[id]/share-of-voice` calculates CTR-weighted market share across all grid points. Includes competitor SOV leaderboard, rank distribution breakdown, and coverage percentages.
- **Competitor Intelligence** — `/api/scans/[id]/competitors` aggregates competitor presence across grid points with dominance scores, coverage %, and Herfindahl-Hirschman Index (HHI) for market concentration analysis.
- **Ranking Volatility Tracking** — `/api/scans/[id]/volatility` measures rank stability per grid point across runs using standard deviation + linear regression. Stability grades (A–F), most volatile/stable points, and trend classification (improving/declining/stable).
- **Heatmap Data API** — `/api/scans/[id]/heatmap` returns color-coded grid points with CTR visibility scores, quadrant analysis (NE/NW/SE/SW), and top competitor per point.
- **Keyword Cannibalization Detector** — `/api/scans/cannibalization` identifies overlapping scans competing for the same geographic area using Haversine distance + Jaccard keyword similarity with severity ratings and merge recommendations.
- **Executive Summary** — `/api/scans/[id]/summary` auto-generates natural language insights with metrics, top competitors, and 3–5 actionable recommendations.
- **GBP Audit** — `/api/scans/[id]/audit` scores business profiles across 5 categories (Visibility, Rankings, Reviews, Profile Completeness, Competitive Position) with competitor benchmarking.
- **Scan Run Comparison** — `/api/scans/[id]/compare` compares two scan runs side-by-side with rank deltas, direction classification, and visibility change tracking.
- **Multi-Location Overview** — `/api/scans/overview` aggregates all scans for a business with trend analysis across locations.
- **White-Label Settings** — `/api/settings/whitelabel` GET/PUT for company name, logo URL, brand color, favicon, support email, and custom domain. Stored via GlobalSetting model with upsert.

#### Infrastructure
- **Scan Queue Persistence** — Queue state survives server restarts. `recoverQueue()` resets interrupted RUNNING→PENDING scans and re-enqueues all pending work on startup.
- **Webhook Dispatcher** — `src/lib/webhookDispatcher.ts` with HMAC-SHA256 signing, 5s timeout, parallel dispatch via `Promise.allSettled`.
- **Scanner Webhook Integration** — `SCAN_COMPLETE` dispatched after successful completion, `RANK_CHANGE` after alert creation, `SCAN_FAILED` in error handler.

---

## [1.7.1] - 2026-03-22

### Full Codebase Audit & Scanner Accuracy Overhaul

Comprehensive 6-phase security and quality audit covering all API routes, frontend components, and library code. Deep analysis of the scan pipeline identified and fixed critical accuracy and reliability issues in the scanner, scraper, and grid engines.

#### Security
- **CRITICAL: Localhost Guard on Update Endpoint** — `/api/system/update` (which runs `git pull` + `npm install`) is now restricted to localhost-only requests via host + x-forwarded-for validation.
- **SQL Injection Prevention** — Replaced all `$queryRawUnsafe` calls with parameterized `$queryRaw(Prisma.sql\`...\`)` across scan detail, review detail, and review rerun routes.
- **Error Message Leak** — Proxy validation endpoint no longer exposes internal error messages to clients.
- **Input Validation** — Scan creation now validates keyword (required, trimmed), clamps radius (0.5–100km), gridSize (1–15), and whitelists shape/frequency values. Lookback POST validates `scanIds` is an array.
- **PATCH Whitelisting** — Scan update endpoint only accepts whitelisted fields, preventing arbitrary field modification.

#### Fixed
- **SAB (Service Area Business) Override Bug** — Explicit SAB flag from Google API was being incorrectly overridden by the address-has-digits heuristic. Explicit API flag is now authoritative and never downgraded.
- **Scanner Race Condition** — Stopped/reset scans continued processing inside the retry loop. Added mid-retry status check to abort immediately when scan is stopped.
- **No Backoff on Google Blocks** — Non-proxy errors (HTTP 418/429, captcha, unusual traffic) now trigger browser re-launch with proxy rotation + exponential backoff (2s, 4s, 8s) between retries.
- **Scroll Loading Too Aggressive** — Increased from 3 to 5 no-new-results iterations and 12 to 15 max scroll cycles to capture all 20 results reliably when Google pauses lazy-loading.
- **SMART Grid Scaling** — Ring distances were scaled by `radiusKm / 3` (hardcoded 3km baseline). Fixed to scale by `radiusKm / maxRingDist` so all radius values produce correct coverage.
- **Stop Endpoint Missing Validation** — `/api/scans/[id]/stop` now returns 404 for missing scans and 409 for already-stopped scans instead of crashing with 500.
- **HTTP 200 on Error** — 8 API routes were returning HTTP 200 with error payloads. All catch blocks now return proper 4xx/5xx status codes.
- **Stale Polling Closure** — Scan detail page had a monolithic `useEffect` causing stale `activeRunId` in the polling interval. Split into separate initial-fetch and polling effects with correct dependency arrays.
- **Missing React Keys** — Added stable `key` props to competitor lists, business cards, review lists, priority issues, and suggested responses.
- **Prisma Type Casts** — Removed all `(prisma as any)` casts (15+ instances) by regenerating the Prisma client.
- **Visibility Score Edge Case** — CTR lookup now caps rank at 20 (`Math.min(rank, 20)`) so ranks >20 don't return 0 CTR.

#### Added
- **Error Boundaries** — Added `error.tsx` (segment-level) and `global-error.tsx` (root-level) Next.js error boundaries for graceful crash recovery.
- **Fetch Error Handling** — Scan detail page fetch now checks `res.ok` and handles HTTP errors gracefully instead of silently failing.

#### Changed
- **Structured Logging** — Migrated 40+ `console.log`/`console.error` calls across 16 API routes to the structured `logger` utility with source tags (SCANNER, PROXY, REVIEWS, SCHEDULER, etc.).
- **Performance: Memoized Computations** — `totalPoints`, `avgRank`, `visibilityScore`, and `filteredResults` are now wrapped in `useMemo`; `fetchScan` wrapped in `useCallback` to prevent unnecessary re-renders on large datasets.
- **Browser Type Safety** — Typed Playwright browser variable in lookup route (`Browser | null` instead of `any`).
- **Anti-Detection Timing** — Mouse movement simulation interval changed from fixed 1s to randomized 3-5s to reduce fingerprinting risk.

---

## [1.7.0] - 2026-03-03

### Apify-Level Review Scraper & Export Overhaul

This release completely rewrites the review scraping engine for dramatically improved speed and completeness, and adds rich export options.

#### Added
- **Hybrid Network Interception Scraper:** Reviews are now captured directly from Google Maps' XHR responses via `page.on('response')`, extracting data from API payloads instead of relying solely on fragile DOM selectors.
- **Dual-Stream Collection:** Network interception and DOM scrolling run in parallel — network captures the raw data, DOM provides fallback and enrichment (owner responses, expanded text).
- **Pagination Token Detection:** The scraper detects base64 pagination tokens in API responses for potential follow-up requests.
- **All Languages Filter:** Scraper now automatically selects "All languages" before scrolling, capturing reviews in every language instead of just the browser default.
- **XLSX Export:** Multi-tab Excel export with detailed review data, metrics, and analysis.
- **JSON Export:** Full structured data export in JSON format.
- **PDF Report Export:** Comprehensive multi-page printable report with executive summary, rating distribution, sentiment analysis, response quality, keywords, themes, strengths/weaknesses, risk alerts, action items, monthly trends, flagged reviews, unresponded negative reviews, and complete review listing.

#### Changed
- **2x Faster Scrolling:** Scroll delays reduced from 1500-3500ms to 800-2500ms since scrolling now only needs to trigger network requests, not wait for DOM rendering.
- **Sort-Toggle Recovery:** Triggers every 20 stalls instead of 30 for faster stall recovery.
- **Scroll Increments:** Increased to 1200-2400px for more aggressive lazy-load triggering.
- **Infographic Export → PDF Export:** Renamed and completely rewritten with extensive detail.

#### Fixed
- **Prisma Runtime Errors:** Replaced Prisma ORM calls for `runId`, `runAt`, and `currentRunId` with raw SQL queries to bypass Prisma client type validation cache issues.
- **Review Rerun Errors:** Fixed `distinct` query and `currentRunId` field errors in rerun/history API routes.
- **Language Filter Gap:** Fixed issue where scraper collected ~89% of reviews because Google Maps defaults to showing only the user's browser language.

---

## [1.6.1] - 2026-02-27

### Address Resolver Reliability Patch

#### Fixed
- **Address Resolution Failures:** Fixed an issue where the `AddressResolver` would fail with "Location unknown" due to browser CORS policies and strict OpenStreetMap rate limits.
- **Backend API Proxy:** Requests are now routed through a dedicated local `/api/system/reverse-geocode` proxy with a strictly managed server-side 1.5-second processing queue.

---

## [1.6.0] - 2026-02-27

### Grid Status Enhancements Release

#### Added
- **Interactive Grid Status List:** The Grid Status tab now displays a lightweight interactive MiniMap for each row, avoiding performance issues for large grids.
- **Address Resolution:** Added reverse geocoding to automatically resolve grid anchor coordinates into full, readable street addresses using OpenStreetMap.
- **Enlarged Map View:** Clicking the enlarge icon on any row's MiniMap opens a full-screen interactive modal for precise spatial inspection of that specific coordinate.

#### Changed
- Removed character limits and truncation from the street address display so the full location context is fully visible.

---

## [1.5.0] - 2026-02-27

### Timeline, History & One-Click Update Release

#### Added
- **Scan Timeline:** Scan detail page now shows a horizontal timeline bar to switch between previous runs. Only visible when a scan has 2+ runs (scheduled repeats or manual reruns).
- **Run History Preservation:** Re-running a scan no longer deletes old results. Each execution gets a unique `runId` — all history is preserved in the database.
- **Scheduled Scan Info in Header:** Scheduled scans now display frequency badge (DAILY/WEEKLY), next run countdown, and a "Cancel Schedule" button directly in the scan report header.
- **One-Click App Update:** The update notification banner now has a "Get Update" button that runs `git pull → pnpm install → prisma db push` in the background and shows a live terminal log — no command line needed.
- **Cancel Schedule Endpoint:** `POST /api/scans/[id]/cancel-schedule` sets frequency to ONCE and clears nextRun.
- **Dynamic Version Check:** `GET /api/system/update` returns the local `package.json` version so the update banner always shows the correct current version.

#### Fixed
- **Update Banner Always Showing:** `CURRENT_VERSION` was hardcoded to `1.2.0` in the component — now fetched dynamically from the server, so it only shows when there is actually a newer version on GitHub.
- **Map Auto-Pan on Pin Click:** Prior fix using `requestAnimationFrame` + `map.setView` to freeze position was reinforced with `bubblingMouseEvents={false}`.

---

## [1.4.0] - 2026-02-27

### Scanner Accuracy & CID Matching Release

This release fixes critical accuracy issues in the scanner — businesses are now matched by their unique CID/Place ID instead of loose name matching, and zip code lookups are geographically precise.

#### Fixed
- **Critical: PlaceId Never Saved** — `api/scans/route.ts` used `(req as any).placeId` instead of the destructured `placeId` variable, meaning the Place ID was **never persisted** to the database. Every scan fell back to name matching.
- **CID Format Mismatch** — Business lookup extracted CID as hex while the scraper converted to decimal. These never matched. Both now use consistent decimal format.
- **False Positive Name Matching** — Removed the 80% token overlap matching that caused unrelated businesses sharing common words (e.g., "Cash For Junk Cars Arizona" matching "Cash For Junk Scrap Cars") to show as found. Now requires exact match or 10+ character substring containment.
- **Zip Code Search Returning Wrong Cities** — Postal lookup used substring matching (`pnLower.includes(cityLower)`) which matched "Chicago Park, CA" for a "Chicago" search. Now uses strict exact-match and bounding-box-first strategy.
- **Map Auto-Pan on Pin Click** — Clicking a pin no longer moves or zooms the map. View position is frozen using save/restore with `requestAnimationFrame`.

#### Added
- **CID-First Matching** — Scanner now matches businesses in priority order: CID → PlaceID → Cross-check → Strict name match. This eliminates false positives.
- **Auto-Save CID** — On first name-based match, the CID is automatically saved to the scan record so all subsequent grid points use CID matching.
- **Numbered Map Markers** — Grid points now display the actual rank number (1-20) inside each marker. Colors: green (1-3), orange (4-10), red (11-20), dark gray with ✕ (not found).
- **Radius-Based Postal Lookup** — Added Haversine-based radius search as a fallback for zip code lookups when bounding box returns too few results.
- **Updated Map Legend** — Legend now shows numbered examples for each rank tier and includes the "Not Found" state.

#### Changed
- **Zip Code Strategy Reversed** — Bounding box is now the primary lookup (geographically exact), with radius and name-match as fallbacks. Previously name-match was primary, causing cross-state false positives.
- **Lookup CID Extraction** — Both URL imports and search results now extract CID as decimal and include ChIJ Place ID when available.

---

## [1.3.0] - 2026-02-12

### Review Intel & Deep Scraping Release

This release transforms the Review Intelligence module with deep scraping capabilities, source attribution for every insight, and robust handling for large business profiles (1000+ reviews).

#### Added
- **Source Attribution:** Every insight (Strengths, Weaknesses, Sentiments, Themes) now includes an expandable "Source Reviews" section showing the exact reviews that generated the finding.
- **Deep Scraping for Large Businesses:** Completely rewritten scraper logic to handle businesses with 1700+ reviews. Includes robust retry logic, "Load More" handling, and unique ID tracking.
- **CSV Export:** Added ability to export all review data and computed metrics to a formatted CSV file.
- **Client-Side Local Guide Fallback:** Ensures Local Guide distribution graphs render even if API data is incomplete, by computing from the review list on the fly.

#### Fixed
- **"Zero Reviews" Bug:** Fixed a critical issue where looking up businesses would sometimes return 0 reviews due to DOM selector changes or timing issues.
- **Duplicate Reviews:** Implemented a multi-layer deduplication strategy (Strict ID matching + Nested element filtering) to eliminate duplicate reviews caused by Google's nested DOM structure.
- **Preview Count Accuracy:** Fixed a regex bug in the preview route where ratings (e.g., "4.3") were sometimes misread as review counts (e.g., "43").

---
## [1.2.0] - 2026-02-11

### Place ID & Automation Release

This release introduces precision business tracking using Google Place IDs and significantly improves the installation/update experience.

#### Added
- **Place ID Tracking:** Businesses are now tracked via their unique Google Place ID (`pid`) and CID (`cid`) instead of name matching. This eliminates hallucinations and ensures 100% accurate tracking even if business names change.
- **Improved Browser Isolation:** Implemented stricter "clean slate" logic for every scan point, including randomized User-Agents and canvas noise to prevent fingerprinting.
- **One-Click Installation:** Installers for macOS and Windows now automatically create the `.env` file with default configurations. No manual setup required.
- **One-Click Updates:** Added `update_mac.sh` and `update_windows.bat` to automate pulling latest code, updating dependencies, and rebuilding the app.

#### Changed
- **Scan Creation:** "My Business" mode now captures Place ID from Google Maps URLs or search results.
- **Business Cards:** Now display Place ID and CID in the expanded view for verification.

---

## [1.1.0] - 2026-02-10

### Comprehensive Audit & Accuracy Release

This release focuses on a deep audit of the application's core logic, significantly improving scanning accuracy, data reliability, and user experience.

#### Added
- **Isolated Browser Contexts:** Each grid point now runs in a fresh browser context to prevent Google's personalization from skewing results.
- **Improved Scraper Logic:** Added intelligent scrolling to ensure all 20 local pack results are captured reliably.
- **Enhanced Accuracy Headers:** Implemented `DNT` and `Sec-GPC` headers to further reduce search personalization.
- **Normalized Business Matching:** Replaced naive substring matching with a robust normalization algorithm (strips LLC/Inc suffixes, punctuation, etc.) for precise target business detection.
- **Real-time Dashboard Stats:** Dashboard now pulls actual data from the database (completed/active scans) instead of placeholder values.
- **Click-outside Dismiss:** Business lookup search dropdown now automatically dismisses when clicking elsewhere.

#### Changed
- **Scanner Zoom Level:** Increased to `15z` for better local-pack relevance at each grid point.
- **Competitor Intelligence Calculation:** Fixed a critical bug where review metrics were double-counted per-appearance. Statistics now correctly reflect unique businesses.
- **Strategic Analysis Refinement:** Threat score calculation denominator fixed to use total appearances instead of grid points.
- **UI Tab Fix:** Categories data now correctly renders under the "Categories" tab in the Competitor Intelligence dashboard.
- **openNow logic:** Refined to prevent false-positives for closed businesses (e.g., "Opens at 9 AM").

#### Fixed
- **Profile Metrics Typo:** Fixed `servicAreaBusinesses` typo throughout the codebase.
- **Strategic Analysis Styling:** Removed hacky string manipulation for threat level colors; implemented a type-safe hex color mapping.

#### Security
- **PATCH Endpoint Hardening:** Added field whitelisting to the scan update API to prevent arbitrary field modification.

---
