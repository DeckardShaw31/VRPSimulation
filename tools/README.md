Tools folder

- `static-server.js` - minimal Express server to serve the app for headless runs and CI.
- `run_scenario.js` - Puppeteer runner that loads a scenario and saves CSV outputs to experiments/results/<run>.

Usage:
- Start server: `node tools/static-server.js`
- In another terminal: `node tools/run_scenario.js` (writes outputs to `experiments/results/run1`)
