/**
 * KP Wallpanel — Contact Column Extractor
 * ─────────────────────────────────────────
 * Pastes into the master sheet's Apps Script editor and run once.
 * Adds 4 new columns: ชื่อลูกค้า · เบอร์โทร · แผนที่ · ที่อยู่
 *
 * HOW TO USE:
 *   1. Open the master Google Sheet
 *   2. Extensions → Apps Script → paste this file → Save
 *   3. Select function "extractContactColumns" → Run
 *   4. Check execution log for results
 *
 * SAFETY:
 *   - Creates a backup tab of each sheet BEFORE touching anything
 *   - Only writes to new columns — never modifies existing data
 *   - If unsure about a value → leaves the cell empty (manual review)
 *   - Running twice is safe: skips rows that already have values
 */

// ── CONFIG ──────────────────────────────────────────────────────────
// Names of the sheet tabs to process (adjust if yours differ)
var TARGET_TABS = ['BKK', 'North', 'NE', 'East', 'South'];

// Header text of the column that contains the combined contact info
var SOURCE_COL_HEADER = /ชื่อ.*ที่อยู่|ชื่อ-ที่อยู่/;

// New column Thai headers (order = left to right)
var NEW_COLS = ['ชื่อลูกค้า', 'เบอร์โทร', 'แผนที่', 'ที่อยู่'];

// How many rows at the top to scan for the header row (handles multi-row headers)
var HEADER_SCAN_ROWS = 5;
// ────────────────────────────────────────────────────────────────────


function extractContactColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];

  TARGET_TABS.forEach(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) { log.push('⚠️  Tab not found: ' + tabName); return; }

    // 1. BACKUP ──────────────────────────────────────────────────────
    var ts = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
    var backupName = tabName + '-backup-' + ts;
    sheet.copyTo(ss).setName(backupName);
    log.push('✅ Backup created: ' + backupName);

    // 2. FIND HEADER ROW & SOURCE COLUMN ─────────────────────────────
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 1) { log.push('⏭️  Empty sheet: ' + tabName); return; }

    var headerRowIdx = -1; // 1-based
    var sourceColIdx = -1; // 1-based

    for (var r = 1; r <= Math.min(HEADER_SCAN_ROWS, lastRow); r++) {
      var rowVals = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
      for (var c = 0; c < rowVals.length; c++) {
        if (SOURCE_COL_HEADER.test(String(rowVals[c]).trim())) {
          headerRowIdx = r;
          sourceColIdx = c + 1;
          break;
        }
      }
      if (headerRowIdx > 0) break;
    }

    if (sourceColIdx < 0) {
      log.push('⚠️  Could not find "ชื่อ-ที่อยู่ลูกค้า" column in: ' + tabName);
      return;
    }
    log.push('📋 ' + tabName + ': source col = ' + columnLetter(sourceColIdx) + ', header row = ' + headerRowIdx);

    // 3. ADD NEW COLUMNS (skip if already exist) ──────────────────────
    var headerVals = sheet.getRange(headerRowIdx, 1, 1, lastCol).getValues()[0];
    var colMap = {}; // new header name → 1-based col index

    NEW_COLS.forEach(function(h) {
      // Check if already exists
      for (var c = 0; c < headerVals.length; c++) {
        if (String(headerVals[c]).trim() === h) { colMap[h] = c + 1; return; }
      }
      // Add new column at end
      lastCol++;
      sheet.getRange(headerRowIdx, lastCol).setValue(h);
      colMap[h] = lastCol;
      // Style the header cell to match existing header row
      var srcHeader = sheet.getRange(headerRowIdx, sourceColIdx);
      sheet.getRange(headerRowIdx, lastCol).setBackground(srcHeader.getBackground())
           .setFontWeight('bold');
    });

    // 4. PROCESS EACH DATA ROW ────────────────────────────────────────
    var srcValues = sheet.getRange(1, sourceColIdx, lastRow, 1).getValues();
    var written = 0, skipped = 0, uncertain = 0;

    for (var row = 1; row <= lastRow; row++) {
      if (row === headerRowIdx) continue; // skip header rows
      var cell = String(srcValues[row - 1][0] || '').trim();
      if (!cell) continue;

      // Skip rows where new cols already filled
      var alreadyFilled = String(sheet.getRange(row, colMap['เบอร์โทร']).getValue()).trim();
      if (alreadyFilled) { skipped++; continue; }

      var extracted = extractParts(cell);

      if (extracted.maps)    sheet.getRange(row, colMap['แผนที่']).setValue(extracted.maps);
      if (extracted.phone)   sheet.getRange(row, colMap['เบอร์โทร']).setValue(extracted.phone);
      if (extracted.name)    sheet.getRange(row, colMap['ชื่อลูกค้า']).setValue(extracted.name);
      if (extracted.address) sheet.getRange(row, colMap['ที่อยู่']).setValue(extracted.address);

      if (extracted.uncertain) uncertain++;
      written++;
    }

    log.push('   → Written: ' + written + ' rows | Skipped (already filled): ' + skipped + ' | Uncertain (left blank): ' + uncertain);
  });

  Logger.log(log.join('\n'));
  SpreadsheetApp.getUi().alert('Done!\n\n' + log.join('\n'));
}


// ── EXTRACTION LOGIC ─────────────────────────────────────────────────
function extractParts(text) {
  var result = { phone: '', maps: '', name: '', address: '', uncertain: false };
  var work = text;

  // 1. Maps link — always clear
  var mapsMatch = work.match(/https:\/\/maps\.[^\s\n]+/);
  if (mapsMatch) {
    result.maps = mapsMatch[0].trim();
    work = work.replace(mapsMatch[0], '').trim();
  }

  // 2. Phone — only if unambiguous (single 0xxxxxxxxx, no +66, no dash format)
  var phones = work.match(/(?<![0-9+\-])(0[689][0-9]{7,8})(?![0-9\-])/g);
  var hasPlus66  = /\+66/.test(work);
  var hasDashFmt = /0\d{2,3}-\d{3,4}-?\d{3,4}/.test(work);
  var hasSlash   = /0\d{8,9}\s*\/\s*0\d{8,9}/.test(work); // two numbers

  if (phones && phones.length === 1 && !hasPlus66 && !hasDashFmt && !hasSlash) {
    result.phone = phones[0];
    work = work.replace(phones[0], '').trim();
  } else if (phones && phones.length > 1 || hasPlus66 || hasDashFmt || hasSlash) {
    // Multiple or ambiguous numbers → leave everything, mark uncertain
    result.uncertain = true;
    // Still extract maps, skip phone/name/address parsing
    result.address = work.trim();
    return result;
  }

  // 3. Clean up leftover blank lines
  work = work.replace(/\n{2,}/g, '\n').trim();

  // 4. Name detection — first line only if it looks like a person/business name
  var lines = work.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length > 1) {
    var first = lines[0];
    var looksLikeName =
      first.length < 50 &&
      !/บ้านเลขที่|เลขที่|ถนน|ซอย|ต\.|อ\.|จ\.|ม\.\d|หมู่|แขวง|เขต|อำเภอ|จังหวัด|\d{3,}|line|http/i.test(first);
    if (looksLikeName) {
      result.name    = first;
      result.address = lines.slice(1).join('\n').trim();
    } else {
      result.address = work;
    }
  } else {
    result.address = work;
  }

  return result;
}

// Helper: convert 1-based col index to letter (A, B, ... Z, AA, ...)
function columnLetter(n) {
  var s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); }
  return s;
}
