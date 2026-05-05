const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { readProductLinks } = require('./excel');

let browserSession = {
  context: null,
  page: null
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeBrandPrefix(title, brandPrefixes = []) {
  let clean = normalizeSpaces(title);

  for (const prefix of brandPrefixes) {
    const escaped = escapeRegex(prefix);
    const regex = new RegExp(`^${escaped}[\\s\\-–—:|]*`, 'i');
    clean = clean.replace(regex, '').trim();
  }

  return normalizeSpaces(clean);
}

async function safeClick(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 4000 }).catch(async () => {
    await locator.click({ timeout: 4000, force: true });
  });
}

async function tryClickByTexts(page, texts) {
  for (const text of texts) {
    const locator = page.getByText(text, { exact: true }).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    try {
      await safeClick(locator);
      return true;
    } catch (_) {}
  }
  return false;
}
function normalizeImageUrl(url) {
  if (!url) return '';

  let clean = String(url).trim().split('?')[0];

  clean = clean.replace(/\/mq\/\d+\//gi, '/');
  clean = clean.replace(/\/ty\d+\//gi, '/');
  clean = clean.replace(/\/[sw]\d+\//gi, '/');

  return clean;
}

function imageKeyFromUrl(url) {
  const clean = normalizeImageUrl(url);
  if (!clean) return '';

  const parts = clean.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const prev = parts[parts.length - 2] || '';

  let fileNoExt = last.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '').toLowerCase();

  // sadece icon/zoom farkını temizle
  fileNoExt = fileNoExt
    .replace(/_org_zoom$/i, '_org')
    .replace(/_org_icon$/i, '_org');

  return `${prev}/${fileNoExt}`.toLowerCase();
}
async function waitForSellerLogin(page, addLog) {
  const start = Date.now();
  const maxWaitMs = 10 * 60 * 1000; // 10 dk

  let lastState = '';

  while (Date.now() - start < maxWaitMs) {
    const loginButtonVisible =
      await page.getByText('Giriş Yap', { exact: true }).first().isVisible().catch(() => false) ||
      await page.getByText('Giriş yap', { exact: true }).first().isVisible().catch(() => false);

    const phoneInputVisible =
      await page.locator('input[placeholder*="Telefon Numaran"]').first().isVisible().catch(() => false);

    const passwordInputVisible =
      await page.locator('input[placeholder*="Şifrenizi giriniz"]').first().isVisible().catch(() => false);

    const otpTitleVisible =
      await page
        .getByText('Doğrulama Kodunuz Telefon Numaranıza Gönderildi!', { exact: true })
        .first()
        .isVisible()
        .catch(() => false);

    const otpButtonVisible =
      await page.getByText('Kodu Doğrula', { exact: true }).first().isVisible().catch(() => false);

    const sellerPanelVisible =
      await page.getByText('Promosyon & Fiyat', { exact: false }).first().isVisible().catch(() => false) ||
      await page.getByText('Sipariş & Kargo', { exact: false }).first().isVisible().catch(() => false) ||
      await page.getByText('Mağaza & Müşteri', { exact: false }).first().isVisible().catch(() => false);

    if (sellerPanelVisible) {
      if (lastState !== 'done') {
        addLog('success', 'Giriş ve doğrulama tamamlandı, devam ediyorum.');
      }
      return;
    }

    if (otpTitleVisible || otpButtonVisible) {
      if (lastState !== 'otp') {
        addLog('warn', 'SMS doğrulama ekranı açık. Kodu manuel girmeni bekliyorum...');
        lastState = 'otp';
      }
      await sleep(1500);
      continue;
    }

    if (loginButtonVisible || phoneInputVisible || passwordInputVisible) {
      if (lastState !== 'login') {
        addLog('warn', 'Seller panel giriş ekranı açık. Manuel giriş yapmanı bekliyorum...');
        lastState = 'login';
      }
      await sleep(1500);
      continue;
    }

    if (lastState !== 'loading') {
      addLog('info', 'Sayfa yükleniyor / yönlendiriliyor, biraz bekliyorum...');
      lastState = 'loading';
    }

    await sleep(1500);
  }

  throw new Error('Seller panel giriş / SMS doğrulama 10 dakika içinde tamamlanmadı.');
}

async function killLiveSupport(page, addLog) {
  const hidden = await page.evaluate(() => {
    let count = 0;
    const all = Array.from(document.querySelectorAll('body *'));

    for (const el of all) {
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      const style = window.getComputedStyle(el);
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();

      const nearBottomLeft =
        rect.left <= 280 &&
        window.innerHeight - rect.bottom <= 180;

      const supportLike =
        text.includes('canlı destek') ||
        text.includes('trendyol asistan') ||
        text.includes('bilgilendirmeler');

      const fixedLike = style.position === 'fixed' || style.position === 'sticky';

      if ((nearBottomLeft && fixedLike) || supportLike) {
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        count += 1;
      }
    }

    return count;
  }).catch(() => 0);

  if (hidden > 0) {
    addLog('info', `Canlı destek alanı gizlendi/pasifleştirildi (${hidden}).`);
  }
}

async function closeLiveSupportIfOpened(page, addLog) {
  const supportOpened =
    await page.getByText('Trendyol Asistan', { exact: false }).first().isVisible().catch(() => false) ||
    await page.getByText('Bilgilendirmeler', { exact: false }).first().isVisible().catch(() => false);

  if (!supportOpened) return false;

  await page.keyboard.press('Escape').catch(() => {});

  const closeButtons = [
    page.locator('button').filter({ hasText: '×' }).first(),
    page.locator('button').filter({ hasText: '−' }).first(),
    page.locator('button').filter({ hasText: '-' }).first(),
    page.locator('[role="button"]').filter({ hasText: '×' }).first(),
    page.locator('[role="button"]').filter({ hasText: '−' }).first(),
    page.locator('[role="button"]').filter({ hasText: '-' }).first()
  ];

  for (const btn of closeButtons) {
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) continue;

    try {
      await btn.click({ force: true, timeout: 1500 });
      await sleep(300);
      addLog('warn', 'Açılan canlı destek penceresi kapatıldı.');
      return true;
    } catch (_) {}
  }

  return false;
}

async function prepareSafeCheckboxArea(page, addLog) {
  await closeLiveSupportIfOpened(page, addLog);
  await killLiveSupport(page, addLog);

  await page.mouse.move(900, 260).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, 180)).catch(() => {});
  await sleep(250);

  await killLiveSupport(page, addLog);
}

async function scrollRowToSafeZone(page, rowLocator) {
  await rowLocator.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }).catch(() => {});

  await page.evaluate(() => window.scrollBy(0, 80)).catch(() => {});
  await sleep(80);
}

async function extractProductMeta(page, productLink, brandPrefixes, addLog) {
  addLog('info', `Ürün açılıyor: ${productLink}`);
  await page.goto(productLink, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(500);

  let title = '';
  const h1 = page.locator('h1').first();
  if (await h1.count()) {
    title = normalizeSpaces(await h1.innerText().catch(() => ''));
  }

  if (!title) {
    const titleLocator = page.locator('[class*="product-name"], [class*="pr-new-br"] h1').first();
    title = normalizeSpaces(await titleLocator.innerText().catch(() => ''));
  }

  if (!title) {
    throw new Error('Ürün başlığı alınamadı.');
  }

  const cleanTitle = removeBrandPrefix(title, brandPrefixes);

  // Ürün ana görselini al
  let imageUrl = '';

  const imageCandidates = [
    page.locator('img').filter({ has: page.locator('[alt]') }).first(),
    page.locator('.gallery-container img').first(),
    page.locator('[class*="product-image"] img').first(),
    page.locator('[class*="gallery"] img').first(),
    page.locator('img[draggable="false"]').first()
  ];

  for (const img of imageCandidates) {
    const count = await img.count().catch(() => 0);
    if (!count) continue;

    imageUrl =
      await img.evaluate((el) => el.currentSrc || el.src || el.getAttribute('data-src') || '').catch(() => '');

    if (imageUrl) break;
  }

  const imageKey = imageKeyFromUrl(imageUrl);

  addLog('info', `Başlık alındı: ${cleanTitle}`);
  addLog('info', `Görsel anahtarı alındı: ${imageKey || 'yok'}`);

  return {
    title: cleanTitle,
    imageUrl,
    imageKey
  };
}

async function goToPreviousAddedTab(page) {
  const tabCandidates = [
    page.getByText('Daha Önce Eklediklerim', { exact: true }).first(),
    page.locator('button:has-text("Daha Önce Eklediklerim")').first(),
    page.locator('[role="tab"]:has-text("Daha Önce Eklediklerim")').first()
  ];

  for (const locator of tabCandidates) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    try {
      await safeClick(locator);
      await sleep(500);
      return;
    } catch (_) {}
  }
}

async function searchInCampaign(page, productTitle) {
  await goToPreviousAddedTab(page);

  const searchInputCandidates = [
    page.locator('input[placeholder*="Ürün adı"]').first(),
    page.locator('input[placeholder*="barkod"]').first(),
    page.locator('input').nth(2)
  ];

  let searchInput = null;
  for (const candidate of searchInputCandidates) {
    const count = await candidate.count().catch(() => 0);
    if (!count) continue;
    searchInput = candidate;
    break;
  }

  if (!searchInput) {
    throw new Error('Kampanya arama kutusu bulunamadı.');
  }

  await searchInput.click({ timeout: 3000 }).catch(() => {});
  await searchInput.fill('');
  await searchInput.fill(productTitle, { timeout: 4000 });

  const filterButton = page.getByRole('button', { name: /Filtrele/i }).first();
  if (await filterButton.count().catch(() => 0)) {
    await safeClick(filterButton);
  } else {
    await searchInput.press('Enter').catch(() => {});
  }

  await sleep(350);
}

async function collectVisibleRows(page) {
  const rows = page.locator('table tbody tr');
  const count = await rows.count().catch(() => 0);
  const output = [];

  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const text = normalizeSpaces(await row.innerText().catch(() => ''));
    const checkbox = row.locator('input[type="checkbox"]').first();
    const checkboxCount = await checkbox.count().catch(() => 0);

    let rowImageUrl = '';
    const rowImg = row.locator('img').first();
    if (await rowImg.count().catch(() => 0)) {
      rowImageUrl = await rowImg.evaluate((el) => {
        return el.currentSrc || el.src || el.getAttribute('data-src') || el.getAttribute('src') || '';
      }).catch(() => '');
    }

    const rowImageKey = imageKeyFromUrl(rowImageUrl);

    if (!text) continue;

    output.push({
      row,
      text,
      hasCheckbox: checkboxCount > 0,
      checkbox,
      rowImageUrl,
      rowImageKey
    });
  }

  return output;
}
function normalizeImageComparableKey(key) {
  if (!key) return '';

  let k = String(key).toLowerCase().trim();

  // Son kalan varyant kelimelerini de temizle
  k = k
    .replace(/_org_zoom$/i, '')
    .replace(/_org_icon$/i, '')
    .replace(/_org_large$/i, '')
    .replace(/_org_small$/i, '')
    .replace(/_org$/i, '')
    .replace(/_zoom$/i, '')
    .replace(/_icon$/i, '')
    .replace(/_thumb$/i, '')
    .replace(/_thumbnail$/i, '');

  return k;
}

function isImageMatch(productImageKey, rowImageKey) {
  if (!productImageKey || !rowImageKey) return false;

  const a = String(productImageKey).trim().toLowerCase();
  const b = String(rowImageKey).trim().toLowerCase();

  return a === b;
}

async function checkAllRowsOnCurrentPage(page, addLog, productMeta) {
  await prepareSafeCheckboxArea(page, addLog);

  const rows = await collectVisibleRows(page);
  let selected = 0;

  for (const item of rows) {
    if (!item.hasCheckbox) continue;

    const isHeader = /Ürün Bilgileri/i.test(item.text) && !/Stok:/i.test(item.text);
    if (isHeader) continue;

    // Başlık kontrolü
    const titleLooksRelated =
      item.text.toLowerCase().includes(productMeta.title.toLowerCase()) ||
      productMeta.title.toLowerCase().includes(item.text.toLowerCase());

    if (!titleLooksRelated) continue;

    // Görsel kontrolü
    const imageMatched = isImageMatch(productMeta.imageKey, item.rowImageKey);

    if (!imageMatched) {
      addLog(
        'info',
        `Başlık benziyor ama görsel farklı, atlandı. Ürün: ${productMeta.imageKey} | Satır: ${item.rowImageKey}`
      );
      continue;
    }

    await scrollRowToSafeZone(page, item.row);

    const visible = await item.checkbox.isVisible().catch(() => false);
    if (!visible) continue;

    try {
      const checked = await item.checkbox.isChecked().catch(() => false);
      if (checked) {
        selected += 1;
        continue;
      }
    } catch (_) {}

    try {
      await item.checkbox.scrollIntoViewIfNeeded().catch(() => {});
      await item.checkbox.check({ timeout: 1200, force: true });
      selected += 1;
      addLog('success', `Görsel eşleşti, satır seçildi: ${item.rowImageKey}`);
      continue;
    } catch (_) {}

    try {
      const clickable = item.row
        .locator('td input[type="checkbox"], td label, td .checkbox, td .ty-checkbox')
        .first();
      await clickable.click({ timeout: 1200, force: true });
      selected += 1;
      addLog('success', `Görsel eşleşti, satır seçildi: ${item.rowImageKey}`);
      continue;
    } catch (_) {}

    try {
      await item.row.evaluate((el) => {
        const checkbox =
          el.querySelector('input[type="checkbox"]') ||
          el.querySelector('label') ||
          el.querySelector('.checkbox') ||
          el.querySelector('.ty-checkbox');

        if (checkbox) checkbox.click();
      });
      selected += 1;
      addLog('success', `Görsel eşleşti, satır seçildi: ${item.rowImageKey}`);
    } catch (err) {
      addLog('warn', `Bir satır seçilemedi: ${item.text.slice(0, 120)} | ${err.message}`);
    }
  }

  return selected;
}

async function clickRemoveSelected(page) {
  const removeButtonCandidates = [
    page.getByRole('button', { name: /Seçili Ürünleri Kampanyadan Çıkar/i }).first(),
    page.locator('button:has-text("Seçili Ürünleri Kampanyadan Çıkar")').first()
  ];

  for (const button of removeButtonCandidates) {
    const count = await button.count().catch(() => 0);
    if (!count) continue;

    try {
      await safeClick(button);
      await sleep(300);

      await tryClickByTexts(page, ['Onayla', 'Evet', 'Tamam', 'Çıkar']);
      await sleep(700);
      return true;
    } catch (_) {}
  }

  return false;
}

async function gotoNextPage(page) {
  const selectors = [
    page.getByRole('button', { name: /Sonraki/i }).first(),
    page.locator('button[aria-label*="next" i]').first(),
    page.locator('li[title="Next Page"] button').first(),
    page.locator('button:has-text(">")').last(),
    page.locator('a:has-text(">")').last(),
    page.locator('button').filter({ hasText: '›' }).last(),
    page.locator('a').filter({ hasText: '›' }).last()
  ];

  for (const candidate of selectors) {
    const count = await candidate.count().catch(() => 0);
    if (!count) continue;

    const disabled = await candidate.isDisabled().catch(() => false);
    if (disabled) continue;

    try {
      await safeClick(candidate);
      await sleep(500);
      return true;
    } catch (_) {}
  }

  return false;
}
function isBrowserSessionAlive() {
  try {
    if (!browserSession.context) return false;

    const pages = browserSession.context.pages();
    if (!pages) return false;

    if (browserSession.page && typeof browserSession.page.isClosed === 'function') {
      if (!browserSession.page.isClosed()) return true;
    }

    return pages.some((p) => {
      try {
        return !p.isClosed();
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return false;
  }
}
async function processCampaign({ page, campaignLink, productMeta, addLog, shouldStop, campaignWaitMs }) {
  const result = {
    campaignLink,
    found: 0,
    removed: 0,
    status: 'bekliyor',
    note: ''
  };

  addLog('info', `Kampanya açılıyor: ${campaignLink}`);
  await page.goto(campaignLink, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(500);
  await waitForSellerLogin(page, addLog);
  await sleep(campaignWaitMs);
  await prepareSafeCheckboxArea(page, addLog);

  // Aramayı sadece ilk başta yap
  await searchInCampaign(page, productMeta.title);
  await prepareSafeCheckboxArea(page, addLog);

  let notFoundPasses = 0;
  let safety = 0;

  while (safety < 300) {
    safety += 1;

    if (shouldStop()) {
      result.status = 'durduruldu';
      result.note = 'Kullanıcı durdurdu.';
      return result;
    }

    const selectedCount = await checkAllRowsOnCurrentPage(page, addLog, productMeta);

    if (selectedCount > 0) {
      result.found += selectedCount;

      const removed = await clickRemoveSelected(page);

      if (removed) {
        result.removed += selectedCount;
        result.status = 'çıkarıldı';
        addLog('success', `${selectedCount} ürün kampanyadan çıkarıldı.`);

        // ürün çıkardıktan sonra tekrar arama yap
        await sleep(campaignWaitMs);
        await searchInCampaign(page, productMeta.title);
        await prepareSafeCheckboxArea(page, addLog);

        notFoundPasses = 0;
        continue;
      }

      addLog('warn', 'Ürün seçildi ama çıkarma butonu çalışmadı.');
      result.status = 'kısmi';
      result.note = 'Seçim oldu ama çıkarma butonu çalışmadı.';
      return result;
    }

    // Seçim yoksa sonraki sayfaya geç
    const moved = await gotoNextPage(page);

    if (moved) {
      addLog('info', 'Sonraki sayfaya geçildi.');
      await prepareSafeCheckboxArea(page, addLog);
      notFoundPasses = 0;
      continue;
    }

    // Artık sonraki sayfa da yoksa bitir
    notFoundPasses += 1;
    if (notFoundPasses >= 1) {
      break;
    }
  }

  if (result.found === 0) {
    result.status = 'bulunamadı';
    result.note = 'Bu kampanyada ürün bulunamadı.';
    addLog('warn', `Ürün bulunamadı: ${productMeta.title}`);
  } else if (result.status === 'bekliyor') {
    result.status = 'tamamlandı';
  }

  return result;
}

async function reopenProduct(page, link, addLog) {
await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(400);
}

async function getBrowserSession({ headless, addLog }) {
  if (isBrowserSessionAlive()) {
    try {
      const pages = browserSession.context.pages().filter((p) => {
        try {
          return !p.isClosed();
        } catch (_) {
          return false;
        }
      });

      let page = pages[0];
      if (!page) {
        page = await browserSession.context.newPage();
      }

      browserSession.page = page;
      addLog('info', 'Mevcut açık tarayıcı oturumu kullanılacak.');
      return browserSession;
    } catch (_) {
      browserSession = { context: null, page: null };
    }
  }

  browserSession = { context: null, page: null };

  const userDataDir = path.join(process.cwd(), 'user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: null,
    args: ['--start-maximized']
  });

  context.on('close', () => {
    browserSession = { context: null, page: null };
  });

  let page = context.pages()[0];
  if (!page) page = await context.newPage();

  page.on('close', () => {
    try {
      const stillOpen = context.pages().some((p) => !p.isClosed());
      if (!stillOpen) {
        browserSession = { context: null, page: null };
      }
    } catch (_) {
      browserSession = { context: null, page: null };
    }
  });

  browserSession = { context, page };
  addLog('info', 'Yeni tarayıcı oturumu açıldı.');

  return browserSession;
}

async function closeBrowserSession() {
  try {
    if (browserSession.context) {
      await browserSession.context.close().catch(() => {});
    }
  } finally {
    browserSession = { context: null, page: null };
  }
}

async function runAutomation({
  jobId,
  excelPath,
  campaignLinks,
  brandPrefixes,
  productWaitMs,
  campaignWaitMs,
  headless,
  shouldStop,
  addLog,
  addResult
}) {
  const links = readProductLinks(excelPath);
  addLog('info', `Excel okundu. ${links.length} link bulundu.`);

  if (!links.length) {
    throw new Error('Excel içinde işlenecek link yok.');
  }

  const session = await getBrowserSession({ headless, addLog });
  const page = session.page;

  addLog('info', 'Tarayıcı hazır. İlk kullanımda seller panele giriş yapman gerekebilir.');

  let completed = 0;
  let notFound = 0;
  let failed = 0;
  let totalRemoved = 0;

  try {
    for (let i = 0; i < links.length; i += 1) {
      if (shouldStop()) break;

      const productLink = links[i];
      const result = {
        index: i + 1,
        productLink,
        title: '',
        status: 'bekliyor',
        campaigns: [],
        totalRemoved: 0,
        error: ''
      };

      addLog('info', `[${i + 1}/${links.length}] Ürün işleniyor.`);

      try {
const productMeta = await extractProductMeta(page, productLink, brandPrefixes, addLog);
result.title = productMeta.title;
result.imageKey = productMeta.imageKey;
        await sleep(productWaitMs);

        for (const campaignLink of campaignLinks) {
          if (shouldStop()) break;

const campaignResult = await processCampaign({
  page,
  campaignLink,
  productMeta,
  addLog,
  shouldStop,
  campaignWaitMs
});

          result.campaigns.push(campaignResult);
          result.totalRemoved += campaignResult.removed || 0;
          totalRemoved += campaignResult.removed || 0;
        }

        await reopenProduct(page, productLink, addLog);

        const anyFound = result.campaigns.some((x) => x.status !== 'bulunamadı');
        if (!anyFound) {
          result.status = 'bulunamadı';
          notFound += 1;
        } else {
          result.status = 'tamamlandı';
          completed += 1;
        }
      } catch (error) {
  const msg = error?.message || String(error);

  if (shouldStop() || /Target page, context or browser has been closed/i.test(msg)) {
    result.status = 'durduruldu';
    result.error = 'İşlem kullanıcı tarafından durduruldu.';
    addLog('warn', 'İşlem durduruldu.');
    addResult(result);
    break;
  }

  result.status = 'hata';
  result.error = msg;
  failed += 1;
  addLog('error', `Ürün hatası: ${result.error}`);
}

      addResult(result);
      await sleep(productWaitMs);
    }
  } finally {
    // Tarayıcıyı kapatmıyoruz. Oturum açık kalsın diye aynı pencere tekrar kullanılacak.
  }

  return {
    jobId,
    toplamLink: links.length,
    tamamlanan: completed,
    bulunamayan: notFound,
    hatali: failed,
    toplamCikarilan: totalRemoved
  };
}

module.exports = {
  runAutomation,
  closeBrowserSession
};