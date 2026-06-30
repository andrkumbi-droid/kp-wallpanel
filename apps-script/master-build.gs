/**
 * KP Wallpanel Order — Master-Sheet Builder (EN / TH)
 * ------------------------------------------------------------------
 * Run ONCE in the "KP Wallpanel Order" spreadsheet:
 *   Extensions → Apps Script → paste → Save → pick "kpBuildMaster" → ▶ Run.
 *
 * Builds: 6 zone tabs (Bangkok/Northern/Northeastern/Eastern/Southern/
 * Instore) + a monthly "Summary" tab. Safe to re-run (rebuilds headers/
 * formats/rules; never deletes zone data rows; Summary is formula-only).
 *
 * Forces locale en_US so all formulas use commas (fixes the "error"
 * cells that appear under non-US locales which expect ";").
 *
 * For Code.gs (app sync) later — canonical DATA values to write:
 *   Status (col C): New / Packing / Ready / Loaded / Delivered / Cancelled
 *   Paid?  (col D): Paid / Unpaid
 *   Date   (col B): real date (not text). Do NOT write col R (auto-formula).
 */

var KP_ZONES = ['Bangkok','Northern','Northeastern','Eastern','Southern','Instore'];

// EN / TH headers
var KP_HEADERS = [
  'Order No / เลขที่ออเดอร์','Date / วันที่','Status / สถานะ','Paid? / ชำระเงิน','⭐',
  'Panels A / แผ่น A','Panels B / แผ่น B','L-Corner / มุม L','U-Trim / คิ้ว U','T-Trim / คิ้ว T',
  'Extra Clips / คลิปเพิ่ม','Free Clips / คลิปฟรี','Products / สินค้า','Shipping / ค่าส่ง',
  'Discount / ส่วนลด','Total / ยอดรวม','Paid amount / ชำระแล้ว','Outstanding / ค้างชำระ',
  'Pay method / วิธีชำระ','Paid on / ชำระวันที่','Payment by / รับเงินโดย','Delivered on / ส่งวันที่',
  'Time / เวลา','Delivered by / ส่งโดย','Carrier / ขนส่ง','Tracking / เลขพัสดุ',
  'CTN/Bundle / กล่อง·มัด','Customer / ชื่อลูกค้า','Phone / เบอร์โทร','Contact / ช่องทาง',
  'Address / ที่อยู่','Maps link / ลิงก์แผนที่','Delivery round / รอบส่ง','Taken by / รับออเดอร์โดย',
  'Edited by / แก้ไขโดย','Receipt No / เลขใบเสร็จ','Cancel reason / เหตุยกเลิก','Notes / หมายเหตุ'];

var KP_SUM_HEADERS = [
  'Month / เดือน','Orders / ออเดอร์','Revenue / รายได้','Paid / ชำระแล้ว','Outstanding / ค้างชำระ',
  'Panels A / แผ่น A','Panels B / แผ่น B','L-Corner / มุม L','U-Trim / คิ้ว U','T-Trim / คิ้ว T',
  'Extra Clips / คลิปเพิ่ม','Cancelled / ยกเลิก'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('KP')
    .addItem('Build / Update master', 'kpBuildMaster')
    .addToUi();
}

function kpBuildMaster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetLocale('en_US');            // <- formulas use commas
  KP_ZONES.forEach(function(z){ kpBuildZone_(ss, z); });
  kpBuildSummary_(ss);
  ['Sheet1','Tabelle1','Blatt1','ชีต1','Sheet'].forEach(function(n){
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0) { try { ss.deleteSheet(sh); } catch(e) {} }
  });
  ss.toast('KP Master built ✓', 'KP Wallpanel Order', 5);
}

function kpBuildZone_(ss, name) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var H = KP_HEADERS;
  sh.getRange(1, 1, 1, H.length).setValues([H])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  // Outstanding (col R) = Total − Paid; the app sends it as a value per order.
  // Remove any old array-formula spill (it would inflate getLastRow), but keep
  // existing per-order values on a rebuild.
  if (sh.getRange('R2').getFormula()) sh.getRange('R2:R').clearContent();

  // number formats
  sh.getRange('F2:L').setNumberFormat('0');            // piece counts
  sh.getRange('N2:R').setNumberFormat('#,##0');        // money
  sh.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('T2:T').setNumberFormat('yyyy-mm-dd');
  sh.getRange('V2:V').setNumberFormat('yyyy-mm-dd');

  // colour rules: green = Delivered+Paid, red = Unpaid
  var rng = sh.getRange('A2:AL2000');
  var green = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2="Delivered",$D2="Paid")')
    .setBackground('#e6f4ea').setRanges([rng]).build();
  var red = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$D2="Unpaid"')
    .setBackground('#fde7e9').setRanges([rng]).build();
  sh.setConditionalFormatRules([green, red]);

  sh.setColumnWidth(1, 90);    // Order No
  sh.setColumnWidth(13, 240);  // Products
  sh.setColumnWidth(31, 240);  // Address
  sh.setColumnWidth(32, 180);  // Maps
}

function kpBuildSummary_(ss) {
  var sh = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  sh.clear();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, KP_SUM_HEADERS.length).setValues([KP_SUM_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937').setWrap(true);

  // 36 month rows from 2026-07 (new months count from 0 automatically)
  var n = 36, start = new Date(2026, 6, 1), months = [];
  for (var i = 0; i < n; i++) months.push([new Date(start.getFullYear(), start.getMonth() + i, 1)]);
  sh.getRange(2, 1, n, 1).setValues(months).setNumberFormat('yyyy-mm');

  var Z = KP_ZONES;
  // SUMIFS of a column across all zones, month = $A2, only non-cancelled
  function sumNC(col) {
    return Z.map(function(z){
      return "SUMIFS('"+z+"'!"+col+":"+col+",'"+z+"'!$B:$B,\">=\"&$A2,'"+z+"'!$B:$B,\"<\"&EDATE($A2,1),'"+z+"'!$C:$C,\"<>Cancelled\")";
    }).join('+');
  }
  function countWith(crit) {
    return Z.map(function(z){
      return "COUNTIFS('"+z+"'!$B:$B,\">=\"&$A2,'"+z+"'!$B:$B,\"<\"&EDATE($A2,1)"+(crit||'')+")";
    }).join('+');
  }
  function put(a1, expr) { sh.getRange(a1).setFormula('=IFERROR(' + expr + ',0)'); }

  put('B2', countWith(''));                          // Orders (all)
  put('C2', sumNC('$P'));                             // Revenue
  put('D2', sumNC('$Q'));                             // Paid
  sh.getRange('E2').setFormula('=C2-D2');             // Outstanding
  put('F2', sumNC('$F'));                             // Panels A
  put('G2', sumNC('$G'));                             // Panels B
  put('H2', sumNC('$H'));                             // L-Corner
  put('I2', sumNC('$I'));                             // U-Trim
  put('J2', sumNC('$J'));                             // T-Trim
  put('K2', sumNC('$K'));                             // Extra Clips
  put('L2', Z.map(function(z){
      return "COUNTIFS('"+z+"'!$B:$B,\">=\"&$A2,'"+z+"'!$B:$B,\"<\"&EDATE($A2,1),'"+z+"'!$C:$C,\"Cancelled\")";
    }).join('+'));                                    // Cancelled

  // copy row-2 formulas down (relative refs adjust)
  sh.getRange('B2:L2').copyTo(sh.getRange('B3:L' + (n + 1)));

  sh.getRange('B2:B' + (n + 1)).setNumberFormat('0');
  sh.getRange('C2:E' + (n + 1)).setNumberFormat('#,##0');
  sh.getRange('F2:L' + (n + 1)).setNumberFormat('#,##0');

  // highlight current month
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=TEXT($A2,"yyyy-mm")=TEXT(TODAY(),"yyyy-mm")')
    .setBackground('#fff7cc').setBold(true)
    .setRanges([sh.getRange('A2:L' + (n + 1))]).build();
  sh.setConditionalFormatRules([rule]);
  sh.setColumnWidth(1, 90);
}
