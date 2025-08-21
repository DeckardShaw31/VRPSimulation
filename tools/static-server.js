// Minimal static server to serve the app for Puppeteer during CI/local runs
const express = require('express'); const path = require('path'); const app = express(); const port = process.env.PORT || 8000; app.use(express.static(path.join(__dirname, '..'))); app.listen(port, ()=>{ console.log('Static server listening on http://localhost:'+port) });
