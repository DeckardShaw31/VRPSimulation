# Simple aggregator that reads CSVs in experiments/results/* and prints summary statistics
import os, glob, pandas as pd
from pathlib import Path
base = Path(__file__).resolve().parents[1] / 'experiments' / 'results'
all_runs = []
for f in glob.glob(str(base / '*' / 'sim_results.csv')):
    df = pd.read_csv(f)
    df['scenario'] = Path(f).parent.name
    all_runs.append(df)
if not all_runs:
    print('No results found under experiments/results/*/sim_results.csv')
else:
    df = pd.concat(all_runs, ignore_index=True)
    summary = df.groupby('algo').agg(time_ms_mean=('time_ms','mean'), time_ms_std=('time_ms','std'), len_mean=('length','mean'), len_std=('length','std'), runs=('run','count'))
    print(summary)
    out = base / 'aggregate_summary.csv'
    summary.to_csv(out)
    print('Wrote', out)
