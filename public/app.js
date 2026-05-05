document.addEventListener('DOMContentLoaded', () => {
  const excelFileInput = document.getElementById('excelFile');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const addCampaignLinkBtn = document.getElementById('add-campaign-link-btn');
  const addBrandPrefixBtn = document.getElementById('add-brand-prefix-btn');
  const campaignLinksContainer = document.getElementById('campaign-links-container');
  const brandPrefixesContainer = document.getElementById('brand-prefixes-container');
  const statusBox = document.getElementById('statusBox');
  const logsBox = document.getElementById('logsBox');
  const resultsBox = document.getElementById('resultsBox');
  const summaryBox = document.getElementById('summaryBox');
  const headlessCheckbox = document.getElementById('headlessCheckbox');

  let stateTimer = null;
  let lastRenderedLogCount = 0;
  let running = false;

  function setStatus(text, type = 'info') {
    if (!statusBox) return;
    statusBox.textContent = text;
    statusBox.className = `status ${type}`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function addDynamicRow(container, inputClass, placeholder, value = '') {
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.innerHTML = `
      <input type="text" class="${inputClass}" placeholder="${placeholder}" value="${escapeHtml(value)}" />
      <button type="button" class="remove-row-btn">Sil</button>
    `;

    container.appendChild(row);

    const removeBtn = row.querySelector('.remove-row-btn');
    removeBtn.addEventListener('click', () => {
      const allRows = container.querySelectorAll('.dynamic-row');
      if (allRows.length <= 1) {
        const input = row.querySelector('input');
        if (input) input.value = '';
        return;
      }
      row.remove();
    });
  }

  function ensureAtLeastOneRow(container, inputClass, placeholder) {
    if (!container) return;
    const rows = container.querySelectorAll('.dynamic-row');
    if (!rows.length) {
      addDynamicRow(container, inputClass, placeholder);
    }
  }

  function getInputValues(selector) {
    return Array.from(document.querySelectorAll(selector))
      .map((el) => el.value.trim())
      .filter(Boolean);
  }

  function renderLogs(logs) {
    if (!logsBox) return;

    if (!Array.isArray(logs)) {
      logsBox.innerHTML = '';
      return;
    }

    if (logs.length === lastRenderedLogCount) return;
    lastRenderedLogCount = logs.length;

    logsBox.innerHTML = logs
      .map((log) => {
        const time = log.time ? new Date(log.time).toLocaleTimeString('tr-TR') : '';
        return `
          <div class="log-item ${escapeHtml(log.type || 'info')}">
            <span class="log-time">[${escapeHtml(time)}]</span>
            <span class="log-type">${escapeHtml((log.type || 'info').toUpperCase())}</span>
            <span class="log-message">${escapeHtml(log.message || '')}</span>
          </div>
        `;
      })
      .join('');

    logsBox.scrollTop = logsBox.scrollHeight;
  }

  function renderResults(results) {
    if (!resultsBox) return;

    if (!Array.isArray(results) || !results.length) {
      resultsBox.innerHTML = '<div class="empty-state">Henüz sonuç yok.</div>';
      return;
    }

    resultsBox.innerHTML = results
      .map((item) => {
        const campaignsHtml = Array.isArray(item.campaigns)
          ? item.campaigns
              .map((c) => {
                return `
                  <div class="campaign-result">
                    <div><strong>Kampanya:</strong> ${escapeHtml(c.campaignLink || '-')}</div>
                    <div><strong>Durum:</strong> ${escapeHtml(c.status || '-')}</div>
                    <div><strong>Bulundu:</strong> ${escapeHtml(c.found ?? 0)}</div>
                    <div><strong>Çıkarıldı:</strong> ${escapeHtml(c.removed ?? 0)}</div>
                    <div><strong>Not:</strong> ${escapeHtml(c.note || '-')}</div>
                  </div>
                `;
              })
              .join('')
          : '';

        return `
          <div class="result-card">
            <div><strong>#${escapeHtml(item.index || '')}</strong></div>
            <div><strong>Başlık:</strong> ${escapeHtml(item.title || '-')}</div>
            <div><strong>Link:</strong> ${escapeHtml(item.productLink || '-')}</div>
            <div><strong>Durum:</strong> ${escapeHtml(item.status || '-')}</div>
            <div><strong>Toplam Çıkarılan:</strong> ${escapeHtml(item.totalRemoved ?? 0)}</div>
            <div><strong>Hata:</strong> ${escapeHtml(item.error || '-')}</div>
            <div class="campaign-results-wrap">${campaignsHtml}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderSummary(summary) {
    if (!summaryBox) return;

    if (!summary) {
      summaryBox.innerHTML = '<div class="empty-state">Özet henüz oluşmadı.</div>';
      return;
    }

    summaryBox.innerHTML = `
      <div class="summary-grid">
        <div><strong>Toplam Link:</strong> ${escapeHtml(summary.toplamLink ?? 0)}</div>
        <div><strong>Tamamlanan:</strong> ${escapeHtml(summary.tamamlanan ?? 0)}</div>
        <div><strong>Bulunamayan:</strong> ${escapeHtml(summary.bulunamayan ?? 0)}</div>
        <div><strong>Hatalı:</strong> ${escapeHtml(summary.hatali ?? 0)}</div>
        <div><strong>Toplam Çıkarılan:</strong> ${escapeHtml(summary.toplamCikarilan ?? 0)}</div>
      </div>
    `;
  }

  function setRunningUi(isRunning) {
    running = isRunning;

    if (startBtn) startBtn.disabled = isRunning;
    if (stopBtn) stopBtn.disabled = !isRunning;
  }

  async function fetchState() {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();

      const currentJob = data.currentJob || null;
      const logs = data.logs || [];
      const results = data.results || [];
      const summary = currentJob?.summary || null;

      renderLogs(logs);
      renderResults(results);
      renderSummary(summary);

      if (currentJob?.running) {
        setRunningUi(true);
        setStatus('İşlem çalışıyor...', 'running');
      } else {
        setRunningUi(false);

        if (currentJob?.stopRequested) {
          setStatus('İşlem durduruldu.', 'warn');
        } else if (summary) {
          setStatus('İşlem tamamlandı.', 'success');
        } else {
          setStatus('Hazır.', 'info');
        }
      }
    } catch (err) {
      setStatus(`Durum alınamadı: ${err.message}`, 'error');
    }
  }

  function startPolling() {
    stopPolling();
    stateTimer = setInterval(fetchState, 1500);
  }

  function stopPolling() {
    if (stateTimer) {
      clearInterval(stateTimer);
      stateTimer = null;
    }
  }

  async function startJob() {
    try {
      if (!excelFileInput || !excelFileInput.files || !excelFileInput.files[0]) {
        alert('Lütfen önce Excel dosyasını seç.');
        return;
      }

      const campaignLinks = getInputValues('.campaign-link-input');
      const brandPrefixes = getInputValues('.brand-prefix-input');

      if (!campaignLinks.length) {
        alert('En az 1 kampanya linki gir.');
        return;
      }

      const formData = new FormData();
      formData.append('excel', excelFileInput.files[0]);
      formData.append('campaignLinksJson', JSON.stringify(campaignLinks));
      formData.append('brandPrefixes', JSON.stringify(brandPrefixes));
      formData.append('headless', headlessCheckbox?.checked ? 'true' : 'false');

      setRunningUi(true);
      setStatus('İşlem başlatılıyor...', 'running');

      const res = await fetch('/api/start', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Başlatma başarısız.');
      }

      lastRenderedLogCount = 0;
      startPolling();
      await fetchState();
    } catch (err) {
      setRunningUi(false);
      setStatus(`Başlatılamadı: ${err.message}`, 'error');
    }
  }

  async function stopJob() {
    try {
      setStatus('Durduruluyor...', 'warn');

      await fetch('/api/stop', { method: 'POST' }).catch(() => {});
      await fetch('/api/close-browser', { method: 'POST' }).catch(() => {});

      setRunningUi(false);
      await fetchState();
    } catch (err) {
      setStatus(`Durdurma hatası: ${err.message}`, 'error');
    }
  }

  if (addCampaignLinkBtn) {
    addCampaignLinkBtn.addEventListener('click', () => {
      addDynamicRow(campaignLinksContainer, 'campaign-link-input', 'Kampanya linki gir...');
    });
  }

  if (addBrandPrefixBtn) {
    addBrandPrefixBtn.addEventListener('click', () => {
      addDynamicRow(brandPrefixesContainer, 'brand-prefix-input', 'Örn: The Champ Clothing');
    });
  }

  if (startBtn) startBtn.addEventListener('click', startJob);
  if (stopBtn) stopBtn.addEventListener('click', stopJob);

  ensureAtLeastOneRow(campaignLinksContainer, 'campaign-link-input', 'Kampanya linki gir...');
  ensureAtLeastOneRow(brandPrefixesContainer, 'brand-prefix-input', 'Örn: The Champ Clothing');

  setRunningUi(false);
  renderResults([]);
  renderSummary(null);
  startPolling();
  fetchState();

  window.addEventListener('beforeunload', () => {
    stopPolling();
  });
});