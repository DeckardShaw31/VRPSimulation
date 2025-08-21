# Simple targets for running experiments
.PHONY: start run-scenario test analyze
start:
	node ./tools/static-server.js

run-scenario:
	node ./tools/run_scenario.js

test:
	npm test

analyze:
	python analysis/aggregate.py
