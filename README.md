# Trendyol Campaign Removal Automation

A local Playwright application that removes a list of products from selected Trendyol Seller campaigns. Product URLs are imported from Excel, matched against campaign rows, and processed through a small web control panel with live status and logs.

> This is an unofficial seller-side automation project and is not affiliated with Trendyol. Trendyol can change its interface at any time. Test with a small product set and supervise every run.

## What it does

For every product URL in the uploaded workbook, the automation:

1. Opens the public product page.
2. Extracts the product title and image metadata.
3. Removes configured store-name prefixes from the title.
4. Visits each supplied campaign URL.
5. Switches to the **Previously Added** tab.
6. Searches for the normalized product title.
7. Compares visible rows using title and image signals.
8. Selects matching rows across campaign pagination.
9. Clicks **Remove Selected Products from Campaign**.
10. Records missing products and failures in the live job log.
11. Reopens the product page before moving to the next product.

The browser session remains open after a job so the authenticated seller session can be reused.

## Features

- Excel/XLSX product URL import
- Multiple campaign URLs in a single job
- Persistent Playwright browser profile
- Guided first-time Trendyol Seller login
- Product title normalization and configurable brand-prefix removal
- Image-assisted matching to reduce title-only false positives
- Campaign pagination support
- Live-support widget suppression when it blocks controls
- Start, stop, state, log, and controlled browser-close endpoints
- Browser-based control panel at `http://localhost:3010`
- Graceful handling when a product is not present in a campaign

## Technology

- Node.js and Express
- Playwright / Chromium
- Multer for workbook uploads
- SheetJS (`xlsx`) for Excel parsing
- Vanilla HTML, CSS, and JavaScript control panel

## Installation

### Requirements

- Node.js 18 or newer
- npm
- A Trendyol Seller account
- Interactive access for login, CAPTCHA, or two-factor authentication

### Run locally

```bash
git clone https://github.com/stardust07a/trendyol-kampanya-otomasyon.git
cd trendyol-kampanya-otomasyon
npm install
npm run install:browsers
npm start
```

Open `http://localhost:3010` and sign in to Trendyol Seller when the automation browser requests it.

## Excel format

The first worksheet's first column must contain product URLs. A header row is allowed.

| A |
| --- |
| Links |
| `https://www.trendyol.com/...` |
| `https://www.trendyol.com/...` |

Blank cells and non-product values should be removed before starting a large job.

## Control API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/start` | Upload the Excel file and start a job |
| `POST /api/stop` | Request a safe stop |
| `POST /api/close-browser` | Close the persistent browser session deliberately |
| `GET /api/state` | Read current job state and results |
| `GET /api/logs` | Read accumulated job logs |

Only one active job is managed at a time.

## Project structure

```text
├── server.js                    # Express server, upload handling, and API
├── public/                      # Local control panel
└── src/
    ├── excel.js                 # Workbook URL extraction
    ├── jobManager.js            # Job lifecycle, state, results, and logs
    └── trendyolAutomation.js    # Browser session and campaign workflow
```

## Persistent session and privacy

The Playwright profile is stored under `user-data/`. It can contain authentication cookies and seller-session data.

- Never publish, email, or commit that directory.
- Do not run two browser instances against the same profile.
- Use `/api/close-browser` when the session must be closed.
- Keep uploaded Excel files and logs private because they may contain product and campaign information.

## Reliability choices

Campaign pages are dynamic and sometimes covered by support widgets. The automation uses safe-click fallbacks, scrolls rows into a controlled area, normalizes product images, handles pagination, and logs non-matches rather than treating them as fatal errors. It also keeps a single reusable browser session to avoid repeated login interruptions.

## Current limitations

- DOM locators may require updates after a Trendyol UI release.
- There is no official Trendyol API integration.
- The tool removes products; it does not add products or optimize campaign pricing.
- There is no dry-run preview that guarantees zero marketplace interaction.
- Jobs are local and single-user; there is no authentication on the localhost panel.
- CAPTCHA and two-factor authentication require the seller.
- Automated end-to-end tests against Trendyol are not included.
- Large jobs should still be supervised and tested with two or three products first.

## Related project

For target-price campaign selection, campaign-type formulas, 350-product batching, category templates, commission workflows, coupons, and resume memory, see [Trendyol Seller Campaign Automation](https://github.com/stardust07a/trendyol-campaign-automation).

## Author

Built by **Aziz** as a browser-automation and seller-operations project.
