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
  'Order No\nเลขที่ออเดอร์','Date\nวันที่','Status\nสถานะ','Priority\nสำคัญ','Products\nสินค้า',
  'Panels A\nแผ่น A','Panels B\nแผ่น B','L-Corner\nมุม L','U-Trim\nคิ้ว U','T-Trim\nคิ้ว T',
  'Extra Clips\nคลิปเพิ่ม','Free Clips\nคลิปฟรี','Shipping\nค่าส่ง','Discount\nส่วนลด',
  'Total\nยอดรวม','Paid amount\nชำระแล้ว','Outstanding\nค้างชำระ','Paid?\nชำระเงิน','Pay method\nวิธีชำระ',
  'Paid on\nชำระวันที่','Payment by\nรับเงินโดย','Receipt No\nเลขใบเสร็จ','Customer\nชื่อลูกค้า',
  'Phone\nเบอร์โทร','Contact\nช่องทาง','Address\nที่อยู่','Maps link\nลิงก์แผนที่',
  'Delivered by\nส่งโดย','Delivered on\nส่งวันที่','Time\nเวลา','Delivery round\nรอบส่ง',
  'Carrier\nขนส่ง','Tracking\nเลขพัสดุ','CTN/Bundle\nกล่อง·มัด','Taken by\nรับออเดอร์โดย',
  'Edited by\nแก้ไขโดย','Cancel reason\nเหตุยกเลิก','Notes\nหมายเหตุ'];

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
  kpBuildLines_(ss);
  kpBuildProducts_(ss);
  kpBuildReport_(ss);
  kpBuildSummary_(ss);
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
    bg.push(c <= 5  ? '#1f2937'    // Order   (No/Date/Status/Priority/Products)
          : c <= 12 ? '#0f766e'    // Pieces  (Panels..Free Clips)
          : c <= 17 ? '#9a3412'    // Money   (Shipping..Outstanding)
          : c <= 22 ? '#3730a3'    // Payment (Paid?..Receipt No)
          : c <= 27 ? '#155e75'    // Customer(Customer..Maps)
          : c <= 34 ? '#6b21a8'    // Delivery(Delivered by..CTN/Bundle)
          :           '#475569');  // Meta    (Taken/Edited/Cancel)
  }
  sh.getRange(1, 1, 1, N).setBackgrounds([bg]);
  sh.getRange('O1').setBackground('#ca8a04'); // Total header gold accent
  sh.setRowHeight(1, 46);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);

  // number formats
  sh.getRange('F2:L').setNumberFormat('0');      // piece counts (Panels A..Free Clips)
  sh.getRange('M2:Q').setNumberFormat('#,##0');  // money (Shipping..Outstanding)
  sh.getRange('B2:B').setNumberFormat('yyyy-mm-dd');   // Date
  sh.getRange('T2:T').setNumberFormat('yyyy-mm-dd');   // Paid on
  sh.getRange('AC2:AC').setNumberFormat('yyyy-mm-dd');  // Delivered on
  sh.getRange('D2:D').setHorizontalAlignment('center'); // Priority

  // Total column highlight that survives conditional row-colours: bold + gold border
  sh.getRange('O2:O').setFontWeight('bold');
  sh.getRange('O1:O1000').setBorder(null, true, null, true, null, null,
    '#ca8a04', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // hide detail piece columns (Panels A..T-Trim = cols 6–10)
  sh.hideColumns(6, 5);

  // row colour rules: grey = Cancelled, green = Delivered & fully paid, red = open balance
  var rng = sh.getRange('A2:AL2000');
  var cancelled = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$C2="Cancelled"')
    .setBackground('#eceff1').setRanges([rng]).build();
  var green = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2="Delivered",$Q2<=0)')
    .setBackground('#e6f4ea').setRanges([rng]).build();
  var red = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2<>"Cancelled",$Q2>0)')
    .setBackground('#fde7e9').setRanges([rng]).build();
  sh.setConditionalFormatRules([cancelled, green, red]);

  sh.setColumnWidth(1, 90);    // Order No
  sh.setColumnWidth(5, 240);   // Products
  sh.setColumnWidth(25, 240);  // Address
  sh.setColumnWidth(26, 180);  // Maps
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
  put('C3', sumNC('$O'));                             // Revenue (Total col O)
  put('D3', sumNC('$P'));                             // Paid (Paid amount col P)
  sh.getRange('E3').setFormula('=C3-D3');             // Outstanding
  put('F3', sumNC('$F'));                             // Panels A
  put('G3', sumNC('$G'));                             // Panels B
  put('H3', sumNC('$H'));                             // L-Corner
  put('I3', sumNC('$I'));                             // U-Trim
  put('J3', sumNC('$J'));                             // T-Trim
  put('K3', sumNC('$K'));                             // Extra Clips
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
           'Grade / เกรด','Qty / จำนวน','Amount ฿ / ยอด'];
  sh.getRange(1, 1, 1, H.length).setValues([H])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937').setWrap(true);
  sh.setFrozenRows(1);
  sh.getRange('B2:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('G2:H').setNumberFormat('#,##0');
}

// Per-product report (auto from Line Items): total per product + per month.
function kpBuildProducts_(ss) {
  var sh = ss.getSheetByName('Products') || ss.insertSheet('Products');
  sh.clear();
  sh.setFrozenRows(1);
  sh.getRange('A1').setValue('Total pro Produkt / รวมต่อสินค้า').setFontWeight('bold');
  sh.getRange('A2').setFormula(
    '=IFERROR(QUERY(\'Line Items\'!A2:H, "select E, F, sum(G), sum(H) where E is not null group by E, F order by sum(G) desc label E \'Code\', F \'Grade\', sum(G) \'Total Stk\', sum(H) \'Total ฿\'", 0), "—")');
  sh.getRange('G1').setValue('Pro Monat (Stück) / ต่อเดือน').setFontWeight('bold');
  sh.getRange('G2').setFormula(
    '=IFERROR(QUERY(\'Line Items\'!A2:H, "select E, F, sum(G) where E is not null group by E, F pivot A label E \'Code\', F \'Grade\'", 0), "—")');
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(7, 160);
}

// Monthly product report: pick a month from the dropdown → every product sold
// that month with quantity + revenue (sorted by revenue) and a month total.
// Reads the "Line Items" tab (filled by order-sync.gs per order line).
function kpBuildReport_(ss) {
  var sh = ss.getSheetByName('Monthly Report') || ss.insertSheet('Monthly Report');
  sh.clear();
  sh.setFrozenRows(4);
  sh.getRange('A1').setValue('Monthly Product Report / รายงานสินค้าต่อเดือน')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange('A2').setValue('Month / เดือน:').setFontWeight('bold').setHorizontalAlignment('right');

  // month dropdown (plain-text yyyy-MM), default = current month
  var tz = ss.getSpreadsheetTimeZone(), months = [];
  for (var i = 0; i < 36; i++)
    months.push(Utilities.formatDate(new Date(2026, 5 + i, 1), tz, 'yyyy-MM'));
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(months, true).build();
  sh.getRange('B2').setNumberFormat('@')            // keep as text, not auto-date
    .setDataValidation(rule).setValue(Utilities.formatDate(new Date(), tz, 'yyyy-MM'))
    .setFontWeight('bold').setBackground('#fff7cc').setHorizontalAlignment('center');

  // helper: first day of the chosen month (robust to text or date in B2)
  sh.getRange('F1').setFormula('=IFERROR(DATEVALUE($B$2&"-01"),DATE(YEAR($B$2),MONTH($B$2),1))')
    .setNumberFormat('yyyy-mm-dd').setFontColor('#bbbbbb');

  // month revenue total (independent of the table length)
  sh.getRange('D2').setFormula(
    '=IFERROR("Total ฿: "&TEXT(SUMIFS(\'Line Items\'!H:H,'
    + '\'Line Items\'!B:B,">="&$F$1,\'Line Items\'!B:B,"<"&EDATE($F$1,1)),"#,##0"),"")')
    .setFontWeight('bold').setFontColor('#9a3412');

  // product breakdown for the chosen month (filtered on the real Date col B)
  sh.getRange('A4').setFormula(
    '=IFERROR(QUERY(\'Line Items\'!A2:H,'
    + ' "select E, F, sum(G), sum(H)'
    + ' where B >= date \'"&TEXT($F$1,"yyyy-MM-dd")&"\''
    + ' and B < date \'"&TEXT(EDATE($F$1,1),"yyyy-MM-dd")&"\''
    + ' group by E, F order by sum(H) desc'
    + ' label E \'Code / รหัส\', F \'Grade\', sum(G) \'Qty / จำนวน\', sum(H) \'Revenue ฿ / ยอด\'",0),'
    + ' "No sales this month / ไม่มีข้อมูลเดือนนี้")');

  sh.getRange('A4:D4').setFontWeight('bold').setFontColor('#ffffff').setBackground('#1f2937');
  sh.getRange('C5:D').setNumberFormat('#,##0');
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(3, 110);
  sh.setColumnWidth(4, 130);
}
