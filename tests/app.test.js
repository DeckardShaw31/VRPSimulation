/** @jest-environment node */
const fs = require('fs'); const path = require('path'); test('sample scenario exists', ()=>{ const p = path.join(__dirname,'..','experiments','sample_scenarios','scenario_example.json'); expect(fs.existsSync(p)).toBe(true); });
