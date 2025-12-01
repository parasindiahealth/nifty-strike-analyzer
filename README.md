# Nifty Strike Analyzer — Advanced Browser Prototype

## What's included
- `index.html` — main single-page app (Tailwind CSS, LightweightCharts, TF.js)
- `assets/js/ocWidget.js` — option-chain fetcher + renderer (uses a proxy URL)
- `assets/js/app.js` — main application logic: CSV parsing, indicators (MA, BB, ADX, RSI), charting, TF.js model, news sentiment, signal export
- `worker/proxy-worker.js` — Cloudflare Worker script to proxy NSE requests and add CORS headers
- `README.md` — this file

## Deploy (zero budget)
1. **Deploy Cloudflare Worker** (recommended):
   - Create a free Cloudflare account: https://dash.cloudflare.com
   - Create a Worker and paste the contents of `worker/proxy-worker.js`
   - Deploy — you'll receive a `https://<your-worker>.workers.dev` URL
   - Edit `assets/js/ocWidget.js` and replace the `PROXY_URL` placeholder with: `https://<your-worker>.workers.dev/?url=`

2. **Host static site**:
   - Use GitHub Pages (free), Vercel (free), or Netlify (free).
   - Example: GitHub Pages
     - Create a repo, push project files
     - Settings -> Pages -> Publish branch `main` (root)
     - Visit `https://<username>.github.io/<repo>/`

## Notes & Caveats
- NSE may change their API; the worker helps emulate browser headers but scraping may still fail if NSE blocks.
- This is a prototype. Backtest thoroughly before considering any real trades.
- News sentiment is simplistic; extend with proper NLP for production.
- FII/DII sources often require CSV export or scraping protected pages. For zero-budget, upload a CSV export.

## Next steps
- Add authentication and persistent storage (GitHub OAuth + GitHub Gists or IndexedDB)
- Add configurable signal rules and backtesting module
- Improve ML model (LSTM/transformer, features, walk-forward validation)
