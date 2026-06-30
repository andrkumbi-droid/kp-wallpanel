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

// EN (line 1) / TH (line 2) headers — order matches KP_COLS in order-sync.gs.
// 38 columns A–AL. Detail piece columns (Panels A..T-Trim) are hidden by build.
var KP_HEADERS = [
  'Order No\nเลขที่ออเดอร์','Date\nวันที่','Status\nสถานะ','Paid?\nชำระเงิน','Priority\nสำคัญ','Products\nสินค้า',
  'Panels A\nแผ่น A','Panels B\nแผ่น B','L-Corner\nมุม L','U-Trim\nคิ้ว U','T-Trim\nคิ้ว T',
  'Extra Clips\nคลิปเพิ่ม','Free Clips\nคลิปฟรี','Shipping\nค่าส่ง','Discount\nส่วนลด',
  'Total\nยอดรวม','Paid amount\nชำระแล้ว','Outstanding\nค้างชำระ','Pay method\nวิธีชำระ',
  'Paid on\nชำระวันที่','Payment by\nรับเงินโดย','Receipt No\nเลขใบเสร็จ','Customer\nชื่อลูกค้า',
  'Phone\nเบอร์โทร','Contact\nช่องทาง','Address\nที่อยู่','Maps link\nลิงก์แผนที่',
  'Delivered by\nส่งโดย','Delivered on\nส่งวันที่','Time\nเวลา','Delivery round\nรอบส่ง',
  'Carrier\nขนส่ง','Tracking\nเลขพัสดุ','CTN/Bundle\nกล่อง·มัด','Taken by\nรับออเดอร์โดย',
  'Edited by\nแก้ไขโดย','Cancel reason\nเหตุยกเลิก','Notes\nหมายเหตุ'];

var KP_SUM_HEADERS = [
  'Month / เดือน','Orders / ออเดอร์','Revenue / รายได้','Paid / ชำระแล้ว','Outstanding / ค้างชำระ',
  'Panels A / แผ่น A','Panels B / แผ่น B','L-Corner / มุม L','U-Trim / คิ้ว U','T-Trim / คิ้ว T',
  'Extra Clips / คลิปเพิ่ม','Cancelled / ยกเลิก'];

// Firebase season root (bump to v3/... when a new season starts).
var KP_FB = 'https://kp-wallpanel-default-rtdb.asia-southeast1.firebasedatabase.app/v2/';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('KP')
    .addItem('Build / Update master', 'kpBuildMaster')
    .addItem('Refresh Pre-Orders + Customers', 'kpRefreshData')
    .addToUi();
}

// Pull a node from the Firebase REST API (open read rules). Returns object or {}.
function kpFetchFb_(node) {
  try {
    var res = UrlFetchApp.fetch(KP_FB + node + '.json', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return {};
    return JSON.parse(res.getContentText()) || {};
  } catch (e) { return {}; }
}

// Manual refresh of the Firebase-pulled tabs (menu).
function kpRefreshData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  kpBuildPreOrders_(ss);
  kpBuildCustomers_(ss);
  ss.toast('Pre-Orders + Customers refreshed', 'KP', 5);
}

// Shared: dark header row + freeze.
function kpHeader_(sh, H) {
  sh.getRange(1, 1, 1, H.length).setValues([H])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937').setWrap(true);
  sh.setFrozenRows(1);
}
// Shared: clear old data rows, write new ones.
function kpFill_(sh, rows, ncol) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(ncol, sh.getLastColumn())).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, ncol).setValues(rows);
}
// Shared: product lines → "KP009 x 10 · L009 x 5"
function kpLiStr_(li) {
  if (!li || !li.length) return '';
  return li.filter(function(x){ return {panel:1,lcorner:1,tedge:1,uedge:1,ttrim:1,utrim:1,clips:1}[x.type]; })
    .map(function(x){ return (x.code || '') + ' x ' + (x.qty || 0); }).join(' · ');
}

function kpBuildMaster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetLocale('en_US');            // <- formulas use commas
  KP_ZONES.forEach(function(z){ kpBuildZone_(ss, z); });
  kpBuildLines_(ss);
  kpBuildProducts_(ss);
  kpBuildReport_(ss);
  kpBuildPreOrders_(ss);
  kpBuildCustomers_(ss);
  // Summary tab is merged into the Monthly Report now → remove it if present
  var _sum = ss.getSheetByName('Summary'); if (_sum) { try { ss.deleteSheet(_sum); } catch(e) {} }
  ['Sheet1','Tabelle1','Blatt1','ชีต1','Sheet'].forEach(function(n){
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0) { try { ss.deleteSheet(sh); } catch(e) {} }
  });
  ss.toast('KP Master built', 'KP Wallpanel Order', 5);
}

function kpBuildZone_(ss, name) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var H = KP_HEADERS, N = H.length;            // 38 columns (A–AL)
  sh.getRange(1, 1, 1, N).setValues([H])
    .setFontWeight('bold').setFontColor('#ffffff')
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);

  // section colour bands (1-based column → group colour)
  var bg = [];
  for (var c = 1; c <= N; c++) {
    bg.push(c <= 6  ? '#1f2937'    // Order   (No/Date/Status/Paid?/Priority/Products)
          : c <= 13 ? '#0f766e'    // Pieces  (Panels..Free Clips)
          : c <= 18 ? '#9a3412'    // Money   (Shipping..Outstanding)
          : c <= 22 ? '#3730a3'    // Payment (Pay method..Receipt No)
          : c <= 27 ? '#155e75'    // Customer(Customer..Maps)
          : c <= 34 ? '#6b21a8'    // Delivery(Delivered by..CTN/Bundle)
          :           '#475569');  // Meta    (Taken/Edited/Cancel/Notes)
  }
  sh.getRange(1, 1, 1, N).setBackgrounds([bg]);
  sh.getRange('P1').setBackground('#ca8a04'); // Total header gold accent
  sh.setRowHeight(1, 46);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  // number formats
  sh.getRange('G2:M').setNumberFormat('0');      // piece counts (Panels A..Free Clips)
  sh.getRange('N2:R').setNumberFormat('#,##0');  // money (Shipping..Outstanding)
  sh.getRange('B2:B').setNumberFormat('yyyy-mm-dd');   // Date
  sh.getRange('T2:T').setNumberFormat('yyyy-mm-dd');   // Paid on
  sh.getRange('AC2:AC').setNumberFormat('yyyy-mm-dd');  // Delivered on
  sh.getRange('E2:E').setHorizontalAlignment('center'); // Priority

  // Total column highlight that survives conditional row-colours: bold + gold border
  sh.getRange('P2:P').setFontWeight('bold');
  sh.getRange('P1:P1000').setBorder(null, true, null, true, null, null,
    '#ca8a04', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // hide detail piece columns (Panels A..T-Trim = cols 7–11)
  sh.hideColumns(7, 5);

  // row colour rules: grey = Cancelled, green = Delivered & fully paid, red = open balance
  var rng = sh.getRange('A2:AL2000');
  var cancelled = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$C2="Cancelled"')
    .setBackground('#eceff1').setRanges([rng]).build();
  var green = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2="Delivered",$R2<=0)')
    .setBackground('#e6f4ea').setRanges([rng]).build();
  var red = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2<>"Cancelled",$R2>0)')
    .setBackground('#fde7e9').setRanges([rng]).build();
  sh.setConditionalFormatRules([cancelled, green, red]);

  sh.setColumnWidth(1, 90);    // Order No
  sh.setColumnWidth(6, 240);   // Products
  sh.setColumnWidth(26, 240);  // Address
  sh.setColumnWidth(27, 180);  // Maps
}

function kpBuildSummary_(ss) {
  var sh = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  sh.clear();
  sh.setFrozenRows(2);                               // header + grand-total row stay visible
  sh.getRange(1, 1, 1, KP_SUM_HEADERS.length).setValues([KP_SUM_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937').setWrap(true);

  // Row 2 = grand total (all months). Months go in rows 3..(n+2).
  var n = 36, start = new Date(2026, 5, 1), months = [];   // from 2026-06 (season start)
  for (var i = 0; i < n; i++) months.push([new Date(start.getFullYear(), start.getMonth() + i, 1)]);
  sh.getRange(3, 1, n, 1).setValues(months).setNumberFormat('yyyy-mm');
  var last = n + 2;                                  // last month row

  var Z = KP_ZONES;
  // SUMIFS of a column across all zones, month = $A3, only non-cancelled
  function sumNC(col) {
    return Z.map(function(z){
      return "SUMIFS('"+z+"'!"+col+":"+col+",'"+z+"'!$B:$B,\">=\"&$A3,'"+z+"'!$B:$B,\"<\"&EDATE($A3,1),'"+z+"'!$C:$C,\"<>Cancelled\")";
    }).join('+');
  }
  function countWith(crit) {
    return Z.map(function(z){
      return "COUNTIFS('"+z+"'!$B:$B,\">=\"&$A3,'"+z+"'!$B:$B,\"<\"&EDATE($A3,1)"+(crit||'')+")";
    }).join('+');
  }
  function put(a1, expr) { sh.getRange(a1).setFormula('=IFERROR(' + expr + ',0)'); }

  put('B3', countWith(''));                          // Orders (all)
  put('C3', sumNC('$P'));                             // Revenue (Total col P)
  put('D3', sumNC('$Q'));                             // Paid (Paid amount col Q)
  sh.getRange('E3').setFormula('=C3-D3');             // Outstanding
  put('F3', sumNC('$G'));                             // Panels A
  put('G3', sumNC('$H'));                             // Panels B
  put('H3', sumNC('$I'));                             // L-Corner
  put('I3', sumNC('$J'));                             // U-Trim
  put('J3', sumNC('$K'));                             // T-Trim
  put('K3', sumNC('$L'));                             // Extra Clips
  put('L3', Z.map(function(z){
      return "COUNTIFS('"+z+"'!$B:$B,\">=\"&$A3,'"+z+"'!$B:$B,\"<\"&EDATE($A3,1),'"+z+"'!$C:$C,\"Cancelled\")";
    }).join('+'));                                    // Cancelled

  // copy first month-row formulas down (relative refs adjust)
  sh.getRange('B3:L3').copyTo(sh.getRange('B4:L' + last));

  // grand-total row (row 2) = sum of all month rows
  sh.getRange('A2').setValue('TOTAL / รวมทั้งหมด');
  sh.getRange('B2').setFormula('=SUM(B3:B' + last + ')');
  sh.getRange('B2').copyTo(sh.getRange('C2:L2'));     // relative refs → each column sums its own
  sh.getRange('A2:L2').setFontWeight('bold').setBackground('#fde9c8')
    .setBorder(true, null, true, null, false, false, '#9a3412', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  sh.getRange('B2:B' + last).setNumberFormat('0');
  sh.getRange('C2:E' + last).setNumberFormat('#,##0');
  sh.getRange('F2:L' + last).setNumberFormat('#,##0');

  // highlight current month
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=TEXT($A3,"yyyy-mm")=TEXT(TODAY(),"yyyy-mm")')
    .setBackground('#fff7cc').setBold(true)
    .setRanges([sh.getRange('A3:L' + last)]).build();
  sh.setConditionalFormatRules([rule]);
  sh.setColumnWidth(1, 90);
}

// Raw per-product-line ledger (the app fills it; one row per product line).
function kpBuildLines_(ss) {
  var sh = ss.getSheetByName('Line Items') || ss.insertSheet('Line Items');
  var H = ['Month / เดือน','Date / วันที่','Zone / โซน','Order No / เลขที่','Code / รหัส',
           'Category / หมวด','Grade / เกรด','Qty / จำนวน','Amount ฿ / ยอด'];
  sh.getRange(1, 1, 1, H.length).setValues([H])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937').setWrap(true);
  sh.setFrozenRows(1);
  sh.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('H2:I').setNumberFormat('#,##0');
}

// Per-product report (auto from Line Items): total per product + per month.
function kpBuildProducts_(ss) {
  var sh = ss.getSheetByName('Products') || ss.insertSheet('Products');
  sh.clear();
  sh.setFrozenRows(1);
  sh.getRange('A1').setValue('Total pro Produkt / รวมต่อสินค้า').setFontWeight('bold');
  sh.getRange('A2').setFormula(
    '=IFERROR(QUERY(\'Line Items\'!A2:I, "select E, G, sum(H), sum(I) where E is not null group by E, G order by sum(H) desc label E \'Code\', G \'Grade\', sum(H) \'Total Stk\', sum(I) \'Total ฿\'", 0), "—")');
  sh.getRange('G1').setValue('Pro Monat (Stück) / ต่อเดือน').setFontWeight('bold');
  sh.getRange('G2').setFormula(
    '=IFERROR(QUERY(\'Line Items\'!A2:I, "select E, G, sum(H) where E is not null group by E, G pivot A label E \'Code\', G \'Grade\'", 0), "—")');
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(7, 160);
}

// Monthly report: pick a month from the dropdown → category summary
// (KP/K-PVC panels, L/T/U, clips sold+free+packs) plus a per-product table.
// Reads the "Line Items" tab (Category col F, Qty col H, Amount col I).
function kpBuildReport_(ss) {
  var sh = ss.getSheetByName('Report');
  if (!sh) { sh = ss.getSheetByName('Monthly Report'); if (sh) sh.setName('Report'); else sh = ss.insertSheet('Report'); }
  sh.clear();
  sh.setFrozenRows(2);
  sh.getRange('A1').setValue('Report / รายงาน').setFontWeight('bold').setFontSize(13);

  var tz = ss.getSpreadsheetTimeZone();
  var LI = "'Line Items'!";

  // helper (col G): chosen day with time stripped (for the daily block)
  sh.getRange('G1').setFormula('=INT($C$3)').setNumberFormat('yyyy-mm-dd').setFontColor('#bbbbbb');

  // ── DAILY ──  pick a date in C3
  sh.getRange('A3').setValue('DAILY / รายวัน').setFontWeight('bold').setFontColor('#1d4ed8');
  sh.getRange('B3').setValue('Day / วัน:').setFontWeight('bold').setHorizontalAlignment('right');
  var today_ = new Date(); today_.setHours(0, 0, 0, 0);
  sh.getRange('C3').setValue(today_).setNumberFormat('yyyy-mm-dd')   // dropdown set after the day list is built
    .setFontWeight('bold').setBackground('#fff7cc').setHorizontalAlignment('center');
  sh.getRange('D3').setFormula('=IFERROR("Day total ฿: "&TEXT(SUMIFS(' + LI + '$I:$I,' + LI + '$B:$B,">="&$G$1,' + LI + '$B:$B,"<"&($G$1+1)),"#,##0"),"")')
    .setFontWeight('bold').setFontColor('#9a3412');
  kpCatBlock_(sh, 4, '$G$1', '($G$1+1)', LI);          // daily: header row 4, data 5..17

  // ── MONTHLY ──  pick a month in C19
  var months = [];
  for (var i = 0; i < 36; i++) months.push(Utilities.formatDate(new Date(2026, 5 + i, 1), tz, 'yyyy-MM'));
  sh.getRange('A19').setValue('MONTHLY / รายเดือน').setFontWeight('bold').setFontColor('#1d4ed8');
  sh.getRange('B19').setValue('Month / เดือน:').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('C19').setNumberFormat('@')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(months, true).build())
    .setValue(Utilities.formatDate(new Date(), tz, 'yyyy-MM'))
    .setFontWeight('bold').setBackground('#fff7cc').setHorizontalAlignment('center');
  sh.getRange('F1').setFormula('=IFERROR(DATEVALUE($C$19&"-01"),DATE(YEAR($C$19),MONTH($C$19),1))')
    .setNumberFormat('yyyy-mm-dd').setFontColor('#bbbbbb');
  sh.getRange('D19').setFormula('=IFERROR("Month total ฿: "&TEXT(SUMIFS(' + LI + '$I:$I,' + LI + '$B:$B,">="&$F$1,' + LI + '$B:$B,"<"&EDATE($F$1,1)),"#,##0"),"")')
    .setFontWeight('bold').setFontColor('#9a3412');
  kpCatBlock_(sh, 20, '$F$1', 'EDATE($F$1,1)', LI);    // monthly: header row 20, data 21..33

  // ── Detailed per-product table for the chosen MONTH (spills at the bottom) ──
  sh.getRange('A35').setValue('Per product (month) / ต่อสินค้า').setFontWeight('bold');
  sh.getRange('A36').setFormula(
    '=IFERROR(QUERY(' + LI + 'A2:I,'
    + ' "select E, G, sum(H), sum(I)'
    + ' where B >= date \'"&TEXT($F$1,"yyyy-MM-dd")&"\''
    + ' and B < date \'"&TEXT(EDATE($F$1,1),"yyyy-MM-dd")&"\''
    + ' group by E, G order by sum(I) desc'
    + ' label E \'Code / รหัส\', G \'Grade\', sum(H) \'Qty / จำนวน\', sum(I) \'Revenue ฿ / ยอด\'",0),'
    + ' "No sales / ไม่มีข้อมูล")');
  sh.getRange('A36:D36').setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937');
  sh.getRange('C37:D').setNumberFormat('#,##0');

  // ── DAILY summary: each day of the chosen month + its revenue (cols H–J) ──
  var Z = KP_ZONES, nM = 36, oLast = 5 + nM;
  function sumDay(col, d){ return Z.map(function(z){ return "SUMIFS('"+z+"'!"+col+":"+col+",'"+z+"'!$B:$B,\">=\"&"+d+",'"+z+"'!$B:$B,\"<\"&("+d+"+1),'"+z+"'!$C:$C,\"<>Cancelled\")"; }).join('+'); }
  function cntDay(d){ return Z.map(function(z){ return "COUNTIFS('"+z+"'!$B:$B,\">=\"&"+d+",'"+z+"'!$B:$B,\"<\"&("+d+"+1))"; }).join('+'); }
  sh.getRange('H3').setValue('Days of month / รายวัน').setFontWeight('bold').setFontColor('#1d4ed8');
  sh.getRange(4, 8, 1, 3).setValues([['Day / วัน','Revenue ฿','Orders']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937');
  var darr = [];
  for (var d = 0; d < 31; d++) {
    var rw = 5 + d;
    darr.push([
      '=IF($F$1+' + d + '<EDATE($F$1,1),$F$1+' + d + ',"")',
      '=IF($H' + rw + '="","",' + sumDay('$P', '$H' + rw) + ')',
      '=IF($H' + rw + '="","",' + cntDay('$H' + rw) + ')'
    ]);
  }
  sh.getRange(5, 8, 31, 3).setFormulas(darr);
  sh.getRange('H5:H35').setNumberFormat('dd.mm');
  sh.getRange('I5:I35').setNumberFormat('#,##0');
  sh.getRange('J5:J35').setNumberFormat('0');
  // day dropdown (C3) = the days of the chosen month (from the list above)
  sh.getRange('C3').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange('H5:H35'), true).build());

  // ── YEARLY: all-months money overview (cols N–R) ──
  function sumNC(col, m){ return Z.map(function(z){ return "SUMIFS('"+z+"'!"+col+":"+col+",'"+z+"'!$B:$B,\">=\"&"+m+",'"+z+"'!$B:$B,\"<\"&EDATE("+m+",1),'"+z+"'!$C:$C,\"<>Cancelled\")"; }).join('+'); }
  function cnt(m){ return Z.map(function(z){ return "COUNTIFS('"+z+"'!$B:$B,\">=\"&"+m+",'"+z+"'!$B:$B,\"<\"&EDATE("+m+",1))"; }).join('+'); }
  sh.getRange('N3').setValue('YEARLY (all months) / รายปี').setFontWeight('bold').setFontColor('#1d4ed8');
  sh.getRange(4, 14, 1, 5).setValues([['Month / เดือน','Orders','Revenue ฿','Paid ฿','Outstanding ฿']])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937');
  var mrows = [];
  for (var k = 0; k < nM; k++) mrows.push([new Date(2026, 5 + k, 1)]);
  sh.getRange(6, 14, nM, 1).setValues(mrows).setNumberFormat('yyyy-mm');
  sh.getRange('O6').setFormula('=IFERROR(' + cnt('$N6') + ',0)');
  sh.getRange('P6').setFormula('=IFERROR(' + sumNC('$P', '$N6') + ',0)');   // Revenue = Total col P
  sh.getRange('Q6').setFormula('=IFERROR(' + sumNC('$Q', '$N6') + ',0)');   // Paid = Paid amount col Q
  sh.getRange('R6').setFormula('=P6-Q6');                                   // Outstanding
  sh.getRange('O6:R6').copyTo(sh.getRange('O7:R' + oLast));
  sh.getRange('N5').setValue('TOTAL');
  sh.getRange('O5').setFormula('=SUM(O6:O' + oLast + ')');
  sh.getRange('O5').copyTo(sh.getRange('P5:R5'));
  sh.getRange('N5:R5').setFontWeight('bold').setBackground('#fde9c8');
  sh.getRange('O5:R' + oLast).setNumberFormat('#,##0');
  sh.getRange('O5:O' + oLast).setNumberFormat('0');
  var curM = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=TEXT($N6,"yyyy-mm")=TEXT(TODAY(),"yyyy-mm")')
    .setBackground('#fff7cc').setBold(true)
    .setRanges([sh.getRange('N6:R' + oLast)]).build();
  sh.setConditionalFormatRules([curM]);

  sh.setColumnWidth(1, 175);
  sh.setColumnWidth(2, 100);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 130);
  sh.setColumnWidth(8, 70);    // Days: Day
  sh.setColumnWidth(9, 95);    // Days: Revenue
  sh.setColumnWidth(10, 60);   // Days: Orders
  sh.setColumnWidth(14, 80);   // Yearly: Month
  sh.setColumnWidth(15, 70);   // Yearly: Orders
}

// Category summary block (KP/K-PVC panels, L/T/U, clips) for a date range.
// hr = header row; dS/dE = start/end date refs (cell or expression strings).
function kpCatBlock_(sh, hr, dS, dE, LI) {
  var dr = hr + 1;   // first data row
  function q(cat){ return '=SUMIFS(' + LI + '$H:$H,' + LI + '$F:$F,"' + cat + '",' + LI + '$B:$B,">="&' + dS + ',' + LI + '$B:$B,"<"&' + dE + ')'; }
  function b(cat){ return '=SUMIFS(' + LI + '$I:$I,' + LI + '$F:$F,"' + cat + '",' + LI + '$B:$B,">="&' + dS + ',' + LI + '$B:$B,"<"&' + dE + ')'; }
  sh.getRange(hr, 1).setValue('Category / หมวด').setFontWeight('bold');
  sh.getRange(hr, 2).setValue('Qty / จำนวน').setFontWeight('bold');
  sh.getRange(hr, 3).setValue('Baht ฿').setFontWeight('bold');
  sh.getRange(hr, 1, 1, 3).setFontColor('#ffffff').setBackground('#1f2937');
  var rKP=dr, rKPVC=dr+1, rL=dr+3, rT=dr+4, rU=dr+5, rCS=dr+7, rCSp=dr+8, rFP=dr+9, rFG=dr+10, rGA=dr+11;
  var data = [
    ['KP (panels)',             q('KP'),                  b('KP')],
    ['K-PVC (panels)',          q('K-PVC'),               b('K-PVC')],
    ['>> Total panels',         '=B'+rKP+'+B'+rKPVC,      '=C'+rKP+'+C'+rKPVC],
    ['L-Corner',                q('L'),                   b('L')],
    ['T-Trim',                  q('T'),                   b('T')],
    ['U-Trim',                  q('U'),                   b('U')],
    ['>> Total L + T + U',      '=B'+rL+'+B'+rT+'+B'+rU,  '=C'+rL+'+C'+rT+'+C'+rU],
    ['Clips sold (packs)',      q('Clip sold'),           b('Clip sold')],
    ['  = sold pcs (x95)',      '=B'+rCS+'*95',           null],
    ['Clips free /panel (pcs)', q('Clip free/panel'),     null],
    ['Clips free gift (pcs)',   q('Clip free gift'),      null],
    ['>> Given away (pcs)',     '=B'+rFP+'+B'+rFG,        null],
    ['>> Total used (pcs)',     '=B'+rCSp+'+B'+rGA,       null]
  ];
  for (var i = 0; i < data.length; i++) {
    var rr = dr + i;
    sh.getRange(rr, 1).setValue(data[i][0]);
    sh.getRange(rr, 2).setFormula(data[i][1]);
    if (data[i][2]) sh.getRange(rr, 3).setFormula(data[i][2]);
  }
  sh.getRange(dr, 2, 13, 2).setNumberFormat('#,##0');
  [dr+2, dr+6, dr+11, dr+12].forEach(function(rr){ sh.getRange(rr, 1, 1, 3).setFontWeight('bold').setBackground('#eef2ff'); });
}

// Pre-Orders tab — snapshot of the app's preOrders node (pulled from Firebase).
function kpBuildPreOrders_(ss) {
  var sh = ss.getSheetByName('Pre Orders') || ss.insertSheet('Pre Orders');
  var H = ['Pre-ID', 'Status', 'Zone / โซน', 'Customer / ลูกค้า', 'Phone / เบอร์',
           'Contact / ช่องทาง', 'Address / ที่อยู่', 'Maps', 'Products / สินค้า',
           'Notes / โน้ต', 'Created by / โดย', 'Created / สร้างเมื่อ', 'Converted to', 'Cancel reason'];
  kpHeader_(sh, H);
  var po = kpFetchFb_('preOrders');
  var rows = Object.keys(po).map(function(id){
    var p = po[id] || {};
    return [p.id || id, p.status || '', p.zone || '', p.customer || '', p.phone || '',
            p.contact || '', p.address || '', p.location || '', kpLiStr_(p.lineItems),
            p.notes || '', p.createdBy || '', p.createdAt ? new Date(p.createdAt) : '',
            p.convertedId || '', p.cancelReason || ''];
  });
  rows.sort(function(a, b){ return (b[11] ? b[11].getTime() : 0) - (a[11] ? a[11].getTime() : 0); });
  kpFill_(sh, rows, H.length);
  sh.getRange('L2:L').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.setColumnWidth(4, 160); sh.setColumnWidth(7, 220); sh.setColumnWidth(9, 220);
  // red tint for cancelled pre-orders
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="cancelled"').setBackground('#fde7e9')
    .setRanges([sh.getRange('A2:N2000')]).build();
  sh.setConditionalFormatRules([rule]);
}

// Customers tab + Blocklist tab — snapshot of customerMeta (pulled from Firebase).
function kpBuildCustomers_(ss) {
  var cm = kpFetchFb_('customerMeta');
  var cs = ss.getSheetByName('Customers') || ss.insertSheet('Customers');
  var H = ['Phone / เบอร์', 'Name / ชื่อ', 'Address / ที่อยู่', 'Note / โน้ต',
           'Blocked? / บล็อก', 'Block reason / เหตุผล', 'Maps / Geo'];
  kpHeader_(cs, H);
  var rows = [], blk = [];
  Object.keys(cm).forEach(function(k){
    var m = cm[k] || {};
    var geo = (m.geo && typeof m.geo.lat === 'number') ? (m.geo.lat + ',' + m.geo.lng) : (m.loc || '');
    rows.push([k, m.name || '', m.address || '', m.note || '', m.blocked ? 'YES' : '', m.blockReason || '', geo]);
    if (m.blocked) blk.push([k, m.name || '', m.blockReason || '']);
  });
  rows.sort(function(a, b){ return String(a[1]).localeCompare(String(b[1])); });
  kpFill_(cs, rows, H.length);
  cs.setColumnWidth(2, 160); cs.setColumnWidth(3, 240);
  var redRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$E2="YES"').setBackground('#fde7e9')
    .setRanges([cs.getRange('A2:G2000')]).build();
  cs.setConditionalFormatRules([redRule]);

  var bs = ss.getSheetByName('Blocklist') || ss.insertSheet('Blocklist');
  var BH = ['Phone / เบอร์', 'Name / ชื่อ', 'Block reason / เหตุผล'];
  kpHeader_(bs, BH);
  blk.sort(function(a, b){ return String(a[1]).localeCompare(String(b[1])); });
  kpFill_(bs, blk, BH.length);
  bs.setColumnWidth(2, 160); bs.setColumnWidth(3, 260);
}


// === APP -> SHEET RECEIVER (doPost / upsert / Line Items) ===

/**
 * KP Wallpanel Order — App → Sheet receiver (NEW master sheet)
 * ------------------------------------------------------------------
 * Lives in the "KP Wallpanel Order" spreadsheet (same Apps Script
 * project as master-build.gs). Paste as a new file, then:
 *   Deploy → New deployment → Web app → Execute as: Me →
 *   Who has access: Anyone → copy the /exec URL →
 *   paste it into index.html  var SHEETS_WEBAPP_URL = '...'
 *
 * One row per order, upserted by Order No (col A) into the order's
 * zone tab. Writes all 38 columns A–AL (Outstanding col Q is a value,
 * not a formula). Column order/headers must match master-build.gs.
 */

var TOKEN = 'kp-7h3x9q2'; // must equal SHEETS_TOKEN in index.html

// Column order (index = column − 1). 38 columns A–AL. MUST match KP_HEADERS
// order in master-build.gs.
var KP_COLS = ['orderNo','date','status','paid','prio','products','panelsA','panelsB','lcorner',
  'utrim','ttrim','extraClips','freeClips','shipping','discount','total','paidAmount',
  'outstanding','payMethod','paidOn','paymentBy','receiptNo','customer','phone','contact',
  'address','maps','deliveredBy','deliveredOn','time','deliveryRound','carrier','tracking',
  'ctnBundle','takenBy','editedBy','cancelReason','notes'];

function doGet() { return _json({ ok: true, service: 'KP Wallpanel Order sync' }); }

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ error: 'unauthorized' });
    var order = body.order || {};
    if (!order.tab || !order.orderNo) return _json({ error: 'missing tab/orderNo' });
    if (body.action === 'delete') return _json(kpDelete(order));
    return _json(kpUpsert(order));
  } catch (err) {
    return _json({ error: String(err) });
  }
}

function kpUpsert(order) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(order.tab);
  if (!sh) return { error: 'tab not found: ' + order.tab };
  var row = kpFindRow(sh, order.orderNo, sh.getLastRow());
  var target = row > 0 ? row : kpLastDataRow(sh) + 1;

  var N = KP_COLS.length;
  var vals = [];
  for (var c = 1; c <= N; c++) vals.push(kpCell(order, KP_COLS[c - 1]));
  sh.getRange(target, 1, 1, N).setValues([vals]);
  kpSyncLines(ss, order);
  return { ok: true, action: row > 0 ? 'updated' : 'appended', row: target, tab: order.tab, orderNo: order.orderNo };
}

// ── Line Items (one row per product line, for the Products report) ──
var LINES_SHEET = 'Line Items';

function kpClearLines(ss, orderNo) {
  var sh = ss.getSheetByName(LINES_SHEET); if (!sh) return;
  var last = sh.getLastRow(); if (last < 2) return;
  var d = sh.getRange(2, 4, last - 1, 1).getValues(); // col D = Order No
  var on = String(orderNo).trim();
  for (var i = d.length - 1; i >= 0; i--) {            // bottom-up so indices stay valid
    if (String(d[i][0]).trim() === on) sh.deleteRow(i + 2);
  }
}

function kpSyncLines(ss, order) {
  var sh = ss.getSheetByName(LINES_SHEET); if (!sh) return;
  kpClearLines(ss, order.orderNo);
  var lines = order.lines || [];
  if (!lines.length) return;
  var month = String(order.date || '').slice(0, 7);
  var dateVal = kpCell(order, 'date');
  var rows = lines.map(function (l) {
    return [month, dateVal, order.tab, order.orderNo, String(l.code || ''),
            l.cat || '', l.grade || '', parseInt(l.qty) || 0, Number(l.amount) || 0];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}

// Last row that actually has an order (column A non-empty). Robust against
// formula columns that would inflate getLastRow().
function kpLastDataRow(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var a = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = a.length - 1; i >= 0; i--) {
    if (String(a[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

function kpDelete(order) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(order.tab);
  if (!sh) return { error: 'tab not found: ' + order.tab };
  var row = kpFindRow(sh, order.orderNo, sh.getLastRow());
  kpClearLines(ss, order.orderNo);
  if (row < 0) return { ok: true, note: 'not found', orderNo: order.orderNo };
  sh.deleteRow(row);
  return { ok: true, action: 'deleted', row: row, orderNo: order.orderNo };
}

function kpFindRow(sh, orderNo, last) {
  if (last < 2) return -1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues(); // col A from row 2
  var on = String(orderNo).trim();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === on) return i + 2;
  }
  return -1;
}

function kpCell(order, key) {
  if (!key) return '';
  var v = order[key];
  if (key === 'date' || key === 'paidOn' || key === 'deliveredOn') {
    var s = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + 'T00:00:00');
    return v || '';
  }
  return (v == null) ? '' : v;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
