# Nifty Strike Analyzer — Full Browser Tool

This project is a zero-budget, browser-only prototype that:
- Displays candlestick charts using LightweightCharts
- Calculates MA(22), Bollinger Bands, ADX
- Shows an in-app option chain fetched from NSE via a proxy (Cloudflare Worker)
- Trains a small TF.js model in-browser to predict next close (demo)
- Exports a scaffold ready to deploy on GitHub Pages and Cloudflare Workers

## Setup

1. Deploy the Cloudflare Worker:
   - Create an account at https://dash.cloudflare.com
   - Create a Worker and paste the code from `worker/proxy-worker.js`
   - Deploy and copy the worker URL (e.g., https://your-worker.workers.dev)

2. Update proxy URL:
   - Open `assets/js/ocWidget.js`
   - Replace the placeholder `PROXY_URL` value with your worker URL + '?url='
     e.g. "https://your-worker.workers.dev/?url="

3. Host the static site:
   - Use GitHub Pages / Netlify / Vercel to host the project folder (index.html + assets)

## Notes & Caveats
- The NSE JSON endpoint may change. If the option-chain fetch fails, inspect proxied JSON in browser DevTools.
- Respect NSE terms of use. This tool is for personal/learning use.
