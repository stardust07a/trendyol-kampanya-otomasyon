const { runAutomation, closeBrowserSession } = require('./trendyolAutomation');

let currentJob = null;
let logs = [];
let results = [];

function addLog(type, message) {
  logs.push({
    time: new Date().toISOString(),
    type,
    message
  });
}

function addResult(result) {
  results.push(result);
}

async function startJob(options) {
  if (currentJob && currentJob.running) {
    throw new Error('Zaten çalışan bir işlem var.');
  }

  logs = [];
  results = [];

  const job = {
    id: Date.now().toString(),
    running: true,
    stopRequested: false,
    summary: null
  };

  currentJob = job;

  addLog('info', 'İş başlatıldı.');
  addLog('info', `Kampanya link sayısı: ${(options.campaignLinks || []).length}`);
  addLog('info', `Marka prefix sayısı: ${(options.brandPrefixes || []).length}`);

  runAutomation({
    jobId: job.id,
    excelPath: options.excelPath,
    campaignLinks: options.campaignLinks || [],
    brandPrefixes: options.brandPrefixes || [],
    productWaitMs: 400,
    campaignWaitMs: 600,
    headless: options.headless ?? false,
    shouldStop: () => !!currentJob?.stopRequested,
    addLog,
    addResult
  })
    .then((summary) => {
      if (currentJob) {
        currentJob.running = false;
        currentJob.summary = summary;
      }
      addLog('success', 'İşlem tamamlandı.');
    })
    .catch((err) => {
      const msg = err?.message || String(err);
      addLog('error', `RunAutomation hatası: ${msg}`);

      if (currentJob) {
        currentJob.running = false;
        currentJob.summary = {
          toplamLink: 0,
          tamamlanan: 0,
          bulunamayan: 0,
          hatali: 1,
          toplamCikarilan: 0
        };
      }
    });

  return { jobId: job.id };
}

async function stopJob() {
  if (!currentJob) return;

  currentJob.stopRequested = true;
  currentJob.running = false;

  addLog('warn', 'Durdur istendi. Tarayıcı kapatılıyor...');

  try {
    await closeBrowserSession();
  } catch (err) {
    addLog('error', `Tarayıcı kapatma hatası: ${err?.message || String(err)}`);
  }

  addLog('warn', 'İşlem durduruldu.');
}

function getJobState() {
  return {
    currentJob,
    logs,
    results
  };
}

module.exports = {
  startJob,
  stopJob,
  getJobState
};