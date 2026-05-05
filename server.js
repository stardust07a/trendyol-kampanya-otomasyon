const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { startJob, stopJob, getJobState } = require('./src/jobManager');
const { closeBrowserSession } = require('./src/trendyolAutomation');

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^\w.\-]+/g, '_')}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStringArray(input) {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map((x) => String(x).trim()).filter(Boolean);
  }

  return String(input)
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

app.post('/api/start', upload.single('excel'), async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({
        ok: false,
        error: 'Excel dosyası yüklenmedi.'
      });
    }

    const campaignLinks =
      safeJsonParse(req.body.campaignLinksJson || '[]', [])
        .concat(normalizeStringArray(req.body.campaignLinks))
        .map((x) => String(x).trim())
        .filter(Boolean);

    const brandPrefixes =
      safeJsonParse(req.body.brandPrefixes || '[]', [])
        .concat(normalizeStringArray(req.body.brandPrefix))
        .map((x) => String(x).trim())
        .filter(Boolean);

    const headless = String(req.body.headless || 'false') === 'true';

    if (!campaignLinks.length) {
      return res.status(400).json({
        ok: false,
        error: 'En az 1 kampanya linki gerekli.'
      });
    }

    const result = await startJob({
      excelPath: req.file.path,
      campaignLinks,
      brandPrefixes,
      headless
    });

    return res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Başlatma hatası'
    });
  }
});

app.post('/api/stop', async (_req, res) => {
  try {
    await stopJob();

    return res.json({
      ok: true
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Durdurma hatası'
    });
  }
});

app.post('/api/close-browser', async (_req, res) => {
  try {
    await closeBrowserSession();

    return res.json({
      ok: true
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Tarayıcı kapatma hatası'
    });
  }
});

app.get('/api/state', (_req, res) => {
  try {
    const state = getJobState();

    return res.json({
      currentJob: state.currentJob || null,
      logs: state.logs || [],
      results: state.results || []
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Durum alınamadı'
    });
  }
});

app.get('/api/logs', (_req, res) => {
  try {
    const state = getJobState();

    return res.json({
      logs: state.logs || [],
      results: state.results || [],
      currentJob: state.currentJob || null
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Log alınamadı'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});