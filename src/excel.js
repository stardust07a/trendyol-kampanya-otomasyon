const XLSX = require('xlsx');

function readProductLinks(excelPath) {
  const workbook = XLSX.readFile(excelPath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel içinde sayfa bulunamadı.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const links = [];
  for (let i = 1; i < rows.length; i += 1) {
    const raw = String(rows[i]?.[0] || '').trim();
    if (!raw) continue;
    links.push(raw);
  }

  return links;
}

module.exports = {
  readProductLinks
};
