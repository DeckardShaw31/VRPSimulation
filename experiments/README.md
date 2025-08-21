Experiment folder — how to run reproducible experiments with VRPSimulation

This folder contains templates and examples for running reproducible experiments for the VRPSimulation project.

Scenario JSON schema (fields):
{
  "rows": <int>,
  "cols": <int>,
  "seed": <int>,
  "n": <int>, // number of points
  "z": <int>, // repetitions per scenario
  "useDepot": <bool>,
  "depotStrategy": "random|center|recommended|oracle",
  "obstacles": [ {"r":<int>,"c":<int>}, ... ],
  "houses": [ {"r":<int>,"c":<int>,"demand":<int>}, ... ]
}

Run protocol (manual in browser):
1. Start a static server from project root (e.g. `python -m http.server 8000`).
2. Open the app in a browser at http://localhost:8000.
3. Import or reconstruct the scenario described in the JSON (use export/import feature or paste values manually).
4. Run algorithms and use the Export buttons to save CSV/LaTeX outputs.

Automated run (recommended advanced option):
- Use a headless browser (Puppeteer) to script scenario loading, button clicks, and CSV/PNG exports. This requires Node.js and a small script (I can add one on request).

Naming conventions:
- Save outputs under `experiments/results/<scenario-name>/` with files:
  - `raw_runs.csv` — per-trial lengths and runtimes
  - `summary.csv` — mean, std, median, 95% CI
  - `plots/` — PNG/SVG for each figure
  - `scenario.json` — the scenario used

Notes:
- Ensure `n` <= available free cells (rows*cols - obstacles - 1 for depot) to avoid generation errors.
- Use seeded runs (set `seed`) to ensure reproducibility across runs.

