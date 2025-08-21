# VRPSimulation

VRPSimulation is an interactive, research-oriented single-page web app for experimenting with grid-based Vehicle Routing and TSP problems. It is designed to be reproducible, extensible, and useful for small-scale computational experiments and manuscript figures.

Key files
- `index.html` — the UI and controls
- `style.css` — app styles
- `app.js` — main application logic, UI bindings, plotting, and algorithm fallbacks
- `simWorker.js` — optional Web Worker used to run batched simulations off the main thread

How to run
1. Serve the project folder with a simple HTTP server (workers require HTTP). Example:

   python -m http.server 8000

2. Open http://localhost:8000 in a modern browser.

Major features (end-to-end)
- Interactive grid editing:
  - Place points (TSP), houses (transport endpoints with integer demand), obstacles, depot, and Dijkstra start/end.
  - Obstacles block movement and cannot be used as placement cells for points/houses/depot/Dijkstra endpoints.

- Algorithms and heuristics:
  - Nearest Neighbor (NN)
  - 2‑Opt local search
  - Greedy insertion
  - Random‑restart 2‑Opt
  - Held‑Karp exact TSP (exponential; for small n only)
  - Simulated Annealing (SA) with seeded RNG support
  - Genetic Algorithm (GA) with order crossover and swap mutation; deterministic when seeded. Crossover fixed to avoid runtime errors.
  - Clarke‑Wright savings heuristic for CVRP and a CVRP total-length helper (vehicle capacity support)

- Grid routing and metrics:
  - Dijkstra solver on the grid with 4‑neighbour movement avoiding obstacles.
  - Depot recommendation using two metrics: demand-weighted Euclidean sums and exact demand-weighted grid shortest-path sums.
  - Grid metric computation is exact and uses optimized per-target BFS that stops early for candidate-only distances and reuses buffers (fast in practice). A more advanced single-pass multi-source Dijkstra accumulative variant can be added on request.

- Batched simulation & reproducibility:
  - Simulate n points × z runs with optional depot inclusion.
  - Seeded PRNG (xorshift32) for deterministic experiments; SA/GA accept seeded RNG for reproducible behavior.
  - Runs use a Web Worker when available; main-thread fallback exists.
  - Export per-run CSV and scenario JSON for reproducibility.

- Statistical analysis & plotting:
  - Chart.js visualizations for runtime and route length.
  - Bootstrap 95% CIs for algorithm mean lengths.
  - Paired bootstrap p-value and Cohen's d effect-size computations.
  - LaTeX table export for a short summary of results (means, CIs, p-value, effect size).
  - Improved plots: line charts with shaded areas, mean lines and comparison overlays for clearer visual comparison.

- UI improvements:
  - Random-J points: user-configurable J placed on the same row (avoids obstacles).
  - Depot candidate chart is intentionally non-zoomable; time/length charts support modal zoom.
  - Worker warnings include stack traces (console) to ease debugging.

Developer notes & future work
- Exact single-pass multi-source Dijkstra for aggregated demand-weighted sums (the most asymptotically efficient solution) can be implemented to accelerate very large grids and many targets — I can add this on request.
- CVRP improvements: local search per route, route merging heuristics, GA hybridization, or exact small-instance solvers.
- Statistical improvements: t-distribution p-values, power analysis, bootstrap hypothesis frameworks, and LaTeX table templates for journals.

Suggested experiments for a logistic manuscript
- Robust warehouse location under demand uncertainty (compare Euclidean vs grid metric, measure expected route cost and robustness under demand sampling)
- Empirical analysis of metaheuristics for CVRP on grid networks (time vs quality, parameter sensitivity)

If you want, I can scaffold a reproducible experiment runner (JSON config → worker runs → ZIP with CSV+LaTeX+metadata) and example configs for the paper.

License: MIT

---

New in this update

- Improved Genetic Algorithm (GA): tournament selection, order crossover, elitism and seeded RNG for consistent runs.
- Depot timing measurements moved to the Worker: measured BFS times for top-K candidates are computed in the Worker and returned for plotting/export.
- Logging: colorized severity levels, clear/download/filter controls, and optional auto-download of logs when simulations finish.
- Depot timings CSV export button (near the "Recommend Warehouse" control).

Paper ideas you can write with this project

1. "Euclidean vs Grid Metrics for Warehouse Location on Urban Grids": empirical study comparing depot recommendations and resulting route costs under both metrics with demand uncertainty.
2. "Empirical Comparison of Metaheuristics for Grid-based CVRP": compare NN, 2-Opt, SA and GA across time-quality tradeoffs, parameter sensitivity, and paired statistical tests.
3. "Single-pass Multi-source Routing for Demand-weighted Location Scoring": extend the project with the proposed single-pass Dijkstra and report large-scale performance gains and accuracy.

If you'd like, I can scaffold example experiment configs and a small runner to generate reproducible result bundles (CSV + LaTeX + scenario JSON).