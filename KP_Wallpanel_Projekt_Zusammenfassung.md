# KP Wallpanel — Projekt-Zusammenfassung

> Stand: Juni 2026. Diese Datei dokumentiert das gesamte Projekt und insbesondere alle Änderungen aus der laufenden Arbeitssession. Für künftige Sessions als Kontext gedacht.

---

## 1. Projekt-Überblick

**KP Wallpanel** ist eine interne Management-App für ein thailändisches Wandpaneel-Geschäft (WPC/PVC-Paneele, L-Corner, Trims, Clips/Cliplocks).

- **Frontend:** Eine einzige große Datei `index.html` (~600 KB) — statisches HTML + Vanilla JS, gehostet auf **GitHub Pages** unter `https://andrkumbi-droid.github.io/kp-wallpanel/`.
- **Datenbank:** Firebase Realtime Database (Region `asia-southeast1`, Projekt `kp-wallpanel`).
- **Backend-Logik:** Google Apps Script (mehrere Projekte, siehe unten).
- **Sprachen:** Englisch + Thai (überall zweisprachig). Beträge in Baht (฿).
- **Rollen/Bereiche:** Management, Office/Sales, Warehouse, Driver — jeweils eigener Login.
- **Deploy-Workflow:** Code lokal bearbeiten → committen → **GitHub Desktop → Push origin**. Der User pusht selbst.

### Dateistruktur (`C:\Users\andrk\Desktop\Github\kp-wallpanel\`)
| Datei | Zweck |
|---|---|
| `index.html` | Die komplette App (HTML+CSS+JS in einer Datei) |
| `sw.js` | Service Worker (App-Shell-Caching) |
| `firebase-messaging-sw.js` | Push-Notifications (FCM) |
| `warehouse-display.html` | Separates Warehouse-Display |
| `img/products/*.jpg` | Produktbilder (Code als Dateiname, z.B. `KP009.jpg`) |
| `apps-script/Code.gs` | **Web-App** (App ↔ Master-Sheet-Sync) |
| `apps-script/line-bot.gs` | **LINE-Bot** (eigenes Apps-Script-Projekt) |
| `apps-script/extract-columns.gs` | Master-Sheet: Batch-Spalten-Splitter (Backup + einmalig) |
| `apps-script/master-onedit.gs` | Master-Sheet: onEdit Auto-Splitter |
| `KP_Wallpanel_Projekt_Zusammenfassung.md` | Diese Datei |

---

## 2. Die drei/vier Apps-Script-Projekte (WICHTIG: nicht verwechseln!)

Es gibt **mehrere getrennte** Apps-Script-Projekte unter `script.google.com → Meine Projekte`:

1. **Web-App-Projekt** (`Code.gs`) — *„KP Wallpanel — Google Sheets Sync"*, an ein Sheet gebunden (grünes Icon, „Unbenanntes Projekt"). Enthält `_writeMaster`, `_writeRows`, `_updateMaster`, `_clearMaster`, `readMirror`, `MASTER_ID`, `SHEET_ID`.
   - Die App ruft es über `SHEETS_WEBAPP_URL` (`.../exec`) auf: `action: 'readMirror' | target: 'master'/'masterUpdate'/'masterClear'`.
   - **Erkennen:** Im Code-Editor Strg+F nach `_writeMaster` suchen; oder Deploy-URL endet auf `...kAX0w2-i5/exec`.
   - **Deployen nach Änderung:** Code ersetzen → Strg+S → Bereitstellen → Bereitstellungen verwalten → ✏️ → Version „Neue Version" → Bereitstellen. URL bleibt gleich.
2. **LINE-Bot** (`line-bot.gs`) — *„KP Wallpanel LINE Bot"* (blaues Pfeil-Icon, standalone Web-App). Enthält den LINE-Webhook + `ANTHROPIC_API_KEY` + `LINE_TOKEN`.
3. **Master-Sheet-Skript** (gebunden ans Master-Sheet, „Erweiterungen → Apps Script" **im Sheet**) — enthält `master-onedit.gs` (onEdit-Splitter) und optional `extract-columns.gs`.

### Sheets
- **SHEET_ID** `1VIEisPGwwVcarKJrqgZqSqFaUfyoX92BqO9P743_Y30` — Mirror-Sheet (BKK-mirror, North-mirror, NE-mirror, East-mirror, South-mirror) — App liest hier (readMirror).
- **MASTER_ID** `1XXmHZt9RVgrgBEmWVpPBid9_C8kx5DsYnhzmUzBnZQE` — das **echte Master-Sheet** (Tabs pro Zone, thailändische Namen). App schreibt hierher.
- Master-Spalten (1-basiert): A Status · B เลขออเดอร์/No. · C วันที่/Date · D รหัส/Code · E จำนวน/Qty · F ราคา/แผ่น · G ยอดรวม (Formel =E*F) · H Clip Lock · I ค่าขนส่ง/Shipping · J ส่วนลด/Discount · K รวมยอด (Formel) · L/M/N วิธีการชำระ (Payment, manuell) · O รวมยอด COD · **P** รอบวันที่จัดส่ง/Delivery round · **Q** ช่องทางติดต่อ/Contact channel · **R** ชื่อ-ที่อยู่ลูกค้า (kombiniert / Quick-paste-Rohblock) · **S** ชื่อ (Name) · **T** เบอร์โทร (Phone) · **U** ที่อยู่ (Address) · **V** Maps-Link · W ค่าขนส่งตามบิล · X สถานะแพ็ค · Y ขนส่ง/Shipper · Z หมายเหตุ/Notes.

### Sicherheits-Regeln (IMMER beachten)
- **LINE_TOKEN** und **ANTHROPIC_API_KEY** dürfen **NIEMALS** ins GitHub-Repo — nur direkt im Apps Script. Im Repo stehen nur Platzhalter.
- **GOOGLE_SERVICE_ACCOUNT_JSON** nie in Client-Code.
- `Code.gs` enthält nur `SHEET_ID`/`MASTER_ID`/`TOKEN = 'kp-7h3x9q2'` — das ist ok.

### ⚠️ KRITISCHE WARNUNG für Tooling
**NIEMALS `index.html` mit PowerShell `Get-Content`/`Set-Content` bearbeiten!** PowerShell 5.1 liest UTF-8 falsch und **zerschießt alle Thai-Zeichen** (wurde in dieser Session einmal passiert, per `git checkout` gerettet). Immer nur das Edit/Write-Tool verwenden.

---

## 3. Firebase-Datenmodell (Realtime DB Nodes)

| Node | Inhalt |
|---|---|
| `orders` | Alle echten Bestellungen (Objekt, Key = sanitized id) |
| `orderCounters` | Pro Zone die höchste Nummer (`bangkok`, `northern`, `northeastern`, `eastern`, `southern`, `instore`) |
| `wOrders` | Warehouse-Order-Spiegel |
| `activeTours` | Fahrer-Touren |
| `stockItems`, `stockLog` | Lager |
| `containerLog`, `incomingItems` | Incoming/Container |
| `drivers`, `shippers`, `staffList`, `managerPin`, `receiptNum` | Stammdaten |
| `claims` | Reklamationen |
| `attStaff` | Payroll-Mitarbeiter (`{id,name,category,payType,monthlySalary,hourlyRate,lateRate,otRate,tripRate,commRate,cartonRate,kmRate}`) |
| `attEntries` | Payroll-Einträge (`{id,staffId,date,type,qty,note}` type=late\|ot\|trip\|advance\|hours\|commission\|carton\|km\|ferry) |
| `lateLog` | Alte Verspätungs-Einträge (werden als 'late' weiter gezählt) |
| `customerMeta` | Kunden-Overrides + Blocklist (phoneKey → {name,address,loc,note,blocked,blockReason}) |
| `soldOut` | Ausverkaufte Produkte |
| `recentlyDeleted` | Tombstones (gelöschte Orders, 5-Min-Schutz gegen Mirror-Re-Add) |
| `orderPhotos/{warehouse\|delivery}/{safeId}/{pushId}` | Foto-Base64 (lazy geladen) |
| `photoIndex/{warehouse\|delivery}/{safeId}` | leichter Index (nur Anzahl/Meta) für den Pictures-Tab |
| `preOrders` | **NEU:** Pre-Orders |

---

## 4. Was in DIESER Session gemacht wurde (chronologisch nach Themen)

### 4.1 Bestellnummern-Zähler — der große Bug (mehrfach gefixt)
Problem: Beim New Order sprang die nächste Nummer immer wieder hoch (#813 statt #804 etc.), in allen Zonen.
- **Ursache(n):** (a) leere Vorab-Zeilen + Datum-only-Zeilen im Master wurden mitgezählt; (b) gelöschte Test-Orders ließen Daten zurück; (c) Service Worker servierte alten gecachten Code (Orders auf alter Version erstellt); (d) ein altes #813 mit Produkt war noch in Firebase.
- **Lösungen (final):**
  - `peekNextOrderNo(zone)` berechnet die nächste Nummer **live aus den echten Orders** (höchste Order **mit echtem Produkt** + 1, Minimum als Untergrenze) — **ignoriert den gespeicherten Zähler** komplett. Damit ist es immun gegen einen driftenden gespeicherten Zähler.
  - `syncCountersWithOrders` + der Mirror-Recompute zählen **nur Zeilen mit echtem Produkt** (nicht Datum-only).
  - `ofCreate` hat einen Guard: wenn die Feldnummer ≠ Live-Nummer ist, Nachfrage.
  - `orderIdParts(id)` parst Zonen-Präfixe korrekt (`4-539` → 539, `#803` → 803).
- **Wichtig:** Vorab-Nummerierung im Master bleibt (Sheet-Mitarbeiter brauchen sie). App nimmt „höchste echte + 1".

### 4.2 Service Worker — network-first (Commit `fbee664`)
`sw.js` war **cache-first** → nach jedem Deploy lief beim ersten Reload alter Code. Umgestellt auf **network-first** für die App-Shell (Cache nur Offline-Fallback), Cache-Version `kp-v2`. → Latest Code lädt online immer. (Erklärt viele „mein Fix greift nicht"-Effekte.)

### 4.3 Mirror-Import & Status
- **Sheet-Order → App als `new`** statt `delivered` (`mirrorToAppOrder` status:'new'). (Vorher: delivered.)
- **Leere → new:** Wenn eine bisher leere/Geister-Order erstmals Produkte bekommt, wird sie auf `new` gesetzt statt alten `delivered`-Status zu erben (`mirrorApplyUpdate`).
- **Keine halben Imports:** Order wird erst importiert, wenn mind. ein Produkt **qty > 0** hat (Mitarbeiter tippt noch). (Commit `5f0f6f5`)
- **Clips-Anzeige Warehouse:** Fallback auf `o.clips` (Spalte H), wenn lineItems keinen Clip-Eintrag haben. (Commit `637a40a`)

### 4.4 Sales / Umsatz zählt jetzt „alle außer storniert"
- Sales **und** Management-Umsatz zählen jede Order mit `status !== 'cancelled'` (inkl. `new`), nicht nur `delivered`. Bezahlt/Unbezahlt-Split bleibt (payMethod). → Importierte/neue Orders zählen sofort.
- „Needs payment"-Alarm bleibt bewusst auf *gelieferte unbezahlte* beschränkt.

### 4.5 Foto-System (Pictures-Tab)
- **Warehouse-Pack-Foto:** Pflicht beim „Done packing" (mind. 1 Foto). Mehrere Fotos, Kamera **oder Galerie**.
- **Delivery-Foto:** ebenfalls mehrere Fotos + Galerie, sofort gespeichert (wie Warehouse). Pflicht beim Confirm.
- **Neuer Office-Tab „Pictures"** mit 2 Untertabs **Warehouse / Delivery**. Order anklicken → Thumbnails (lazy geladen), Vollbild-Lightbox, Datum/Zeit + wer.
- **Speicherung:** Base64 in separatem `orderPhotos`-Node (nicht im orders-Node → App-Start bleibt schnell), leichter `photoIndex` für die Liste. (Firebase Storage wurde besprochen aber bewusst NICHT genutzt — base64-in-separate-Node reicht für jetzt.)
- Einzelnes Foto löschen (✕) + „Delete all photos".

### 4.6 Packer-Auswahl (Warehouse)
- Im Packing zwischen CTN und Foto: Multi-Select-Chips mit festen Namen: **Way Aung, Rack Khan (Pit), Aung Lay, Mon, Lift** (Konstante `PACKERS`, lateinisch).
- Beim Done werden Packer + `packedBy` (eingeloggter Warehouse-User) + `packedAt` gespeichert.
- Order-Annahme speichert `acceptedBy` + `acceptedAt`.
- Pictures zeigt: „📥 Accepted by … + Zeit" und „👷 Packed by: [eingeloggter + markierte Kollegen] + Zeit".

### 4.7 Warehouse-Login + getrennte Zugänge (Commit `01ebdf6`)
- Warehouse hat jetzt einen **Login (Name + PIN)** wie Office (`s-warehouse-login`, Grid + PIN).
- Staff-Modell: `officeAccess` (Default true) + `warehouseAccess` (opt-in) — zwei Checkboxen im Staff-Modal („Login access").
- `pinMode` ('office'/'warehouse'), `checkPin` ist mode-aware.

### 4.8 Payroll-Modul (Office-Tab, vorher „Attendance")
- Tab umbenannt zu **„Payroll"**, eigene Freischaltung `attendAccess` (Label „Payroll access").
- Pro Mitarbeiter: **Kategorie** (Office/Driver/Warehouse/Other, gruppierte Liste), Gehaltstyp **monatlich fix ODER Stundenlohn**, Sätze: Late ฿/min, OT ฿/h, Trip ฿/Fahrt (Std 100), **Commission ฿/Panel**, **Carton ฿/Karton**, **Km ฿/km**.
- **Einträge nach Typ getrennt** (Late/OT/Trip/Commission/Carton/Km/Ferry/Advance/Hours), je Gruppe mit Zwischensumme + Lösch-✕.
- **Total salary** = Base + OT + Trips + Commission + Carton + Km + Ferry − Late − Advance.
- Mitarbeiter hinzufügen/entfernen; **Löschen nur mit Management-PIN** (`managerPin`, Default „1705").
- Daten: `attStaff` + `attEntries` (+ legacy `lateLog` als 'late').

### 4.9 Kundendaten-Trennung (Quick paste + Sheet onEdit)
Problem: Office-Mitarbeiter klatschen alles in eine Zelle statt Name/Tel/Adresse/Maps zu trennen.
- **App New Order:** „⚡ Quick paste"-Feld → `kpParseCustomer()` trennt automatisch in Name/Tel/Adresse/Maps. Heuristik erkennt Namen **vorne** (erste Zeile) **oder hinten** (direkt nach der Telefonnummer, z.B. „ช่างเปิ๊ล").
- **Sheet direkt:** `master-onedit.gs` (gebunden ans Master-Sheet) splittet die kombinierte Spalte R automatisch beim Einfügen in S/T/U/V (flexible Header-Erkennung per Regex, eigenständiger Parser, füllt nur leere Zellen).
- **Quick-paste-Rohblock → Spalte R:** `o.custRaw` wird gespeichert und in Master-Spalte R geschrieben (`Code.gs _writeRows` schreibt jetzt auch R, m[17]→Spalte 18). **→ Code.gs muss neu deployed werden.**
- **KI-Fallback (eingebaut aber NICHT aktiv):** Wenn Heuristik keinen Namen findet, könnte der LINE-Bot-Endpunkt `parseCustomer` (Claude) befragt werden. Steuerung über `BOT_PARSE_URL` (leer = aus) + `BOT_PARSE_TOKEN`. Aktuell **deaktiviert** (User wollte erst nicht). Zum Aktivieren: Bot neu deployen + `/exec`-URL in App **und** `master-onedit.gs` eintragen.

### 4.10 LINE-Bot Ausbau (`line-bot.gs`)
- Umsatz/Panele zählen jetzt **alle außer storniert** (= wie App).
- **Tages-Umsatz:** „Umsatz 12/6" / „ยอดขาย 12/6" / „12 มิ.ย." → Umsatz des Tages.
- **Produktbilder:** Produktcode (KP009, K-PVC-08) → Bot schickt das Bild (`https://andrkumbi-droid.github.io/kp-wallpanel/img/products/CODE.jpg`).
- **Neue Themen:** Claims, Attendance, Customers — als Stichwort + via Claude-Freitext.
- **`parseCustomer`-Endpunkt** (token-gesichert, nutzt Anthropic-Key serverseitig) für den KI-Fallback der Kundendaten-Trennung.
- Hinweis: `LINE_TOKEN` + `ANTHROPIC_API_KEY` sind im Apps Script gesetzt (User hat sie). Beim Update der Datei diese Keys wieder eintragen.

### 4.11 Lieferschein-Druck (`printDeliverySheet`) — komplett neu gestaltet
Vom flachen Tabellen-Layout zu **Fahrer-freundlichen Order-Blöcken**, gemeinsam mit dem User im Preview iteriert (finale Maße):
- Pro Order ein Block **18 cm breit × min. 4 cm hoch** (wächst bei vielen Produkten), zentriert.
- Spalten im Block: **[Reihenfolge-Kästchen]** (zum Handschreiben 1.2.3.) · **#Nr** · **Name/📞Tel/💬Contact/📍Adresse** · **Produkte je mit ☐ rechts + 📦 CTN** · **Betrag groß + ☐Cash / ☐Online** · darunter **📝 Notes-Zeile**.
- **Summary oben** unter dem Kopf (Total Orders · Total CTN · Grand Total · Notiz-Feld).
- Kopf (gelb) **nur Seite 1**, ab Seite 2 kleine Seitenzahl oben rechts.
- **Auto-Pagination** per JS: misst Blockhöhen bei **fester A4-Breite (180mm-Blöcke)** → korrekte Seitenanzahl unabhängig vom Fenster.
- Stornierte Orders raus. Alte Funktion bleibt als toter `_printDeliverySheetOLD` (nicht aufgerufen).

### 4.12 Driver-Flow Fixes
- **„Load on truck"** bleibt auf „Ready to Load" (springt nicht mehr zu „My Tour"); Checkliste weiter nutzbar.
- **Send to driver:** Orders bleiben **`ready`** (landen in Fahrer-„Ready to Load" mit Checkliste), werden über Tour-Mitgliedschaft aus dem Office-Pool ausgeschlossen. (Ein Zwischenversuch mit `loaded` wurde zurückgenommen.)
- **Confirm Delivery erweitert:** zeigt **Gesamtbetrag**, **☐ Cash / ☐ Online** mit Betragsfeldern (Auto-Befüllung mit Total bei Einzelhaken, Split bei beiden), Live-Abgleich. Confirm nur möglich wenn **Foto da** UND **Cash+Online = Total**. Zahlung (Methode/Beträge/Datum) wird am Auftrag gespeichert.

### 4.13 Quotation-Anpassungen
- Trennstreifen auf **3 Zeichen** gekürzt (`━━━` / `───`).
- **COD-Zeile** `ชำระสินค้าปลายทาง` eingefügt.
- **Clips/Cliplocks** verwenden Einheit **ตัว** (Stück) statt แผ่น (Blatt) und erzeugen keine Auto-Gratis-Clips (Erkennung: Code beginnt mit „CL").

### 4.14 Contact channel überall anzeigen
- Order-Karte (Office), Management/Dashboard, Driver-Tour zeigen jetzt **💬 Contact channel** (+ Delivery round wo vorhanden). Contact ist bidirektional mit Master-Spalte Q verbunden (war schon implementiert, nur Anzeige fehlte).

### 4.15 Customers + Blocklist zusammengelegt
- Blocklist ist jetzt ein **aufklappbares Dropdown oben im Customers-Tab** (eigener Blocklist-Tab entfernt). Customers-Tab sichtbar bei `customerAccess` ODER `blockAccess`; Blocklist-Dropdown nur bei `blockAccess`.

### 4.16 Pflichtfelder New Order
- Beim Create: **Name, Telefon, Adresse, Contact channel** Pflicht. Fehlt was → Meldung mit den fehlenden Feldern, Cursor springt ins erste leere Feld.

### 4.17 Spalten-Ausrichtung
- Edge-Strips-Eingabe hat eine Extra-Spalte (Typ-Auswahl); Header bekam ein 5-Spalten-Raster (`.colh-e`) mit führendem „Type" → Labels stehen über den Feldern.

### 4.18 **Pre-Order-System (NEU, großes Feature)** — Commits `4be9dfa`, `5f91001`
Neuer **Office-Tab „Pre-Order"** (eigene Freischaltung `preorderAccess`):
- **Zweck:** Bestellungen annehmen, bevor Ware da ist — **getrennt** von Stock/Sales (eigener `preOrders`-Node, NICHT in `orders`).
- **Anlegen:** Zone, Quick-paste (auto-split), Kundenfelder, **Produkte mit Preisen**, **Shipping** + **Clip-Packs ×199**, **Live-Summe** (inkl. Auto-Gratis-Clips), Notizen.
- **Kunde sofort im CRM** gespeichert (`customerMeta`, phone-based).
- **Bearbeiten:** ✏️ Edit lädt alles zurück (Update statt neu).
- **Ready-Erkennung:** Pre-Order wird „✅ ready" wenn **alle Produktcodes auf Lager** sind (= Container im Lager angekommen → Stock). Tab-Badge zählt bearbeitbare Pre-Orders.
- **Convert → New:** vergibt Zonen-Bestellnummer, erstellt echte Order (status `new`) mit vollständigen lineItems (Produkte + Clip-Pack + Auto-Gratis-Clips + Shipping), zieht Stock ab, synct ins Master-Sheet + Warehouse. Pre-Order bleibt als `converted` (mit `convertedId`) in der Historie.
- **Cancel:** fragt **Grund** ab, markiert `cancelled` (bleibt gespeichert), Kunde bleibt im CRM.
- Status-Werte: `open` | `converted` | `cancelled`.

---

## 5. Wichtige Architektur-Entscheidungen & Konventionen

- **Eine-Datei-App:** Alles in `index.html`. Globale `var`/`let` oben, Firebase-Listener in `startListeners()` (deferred ~200ms nach Load).
- **Sync-Pattern:** Jede Liste hat eine `syncX()`-Funktion, die das ganze Array als Objekt nach Firebase schreibt (`.set(obj)`), und einen `.on('value')`-Listener, der zurücklädt + re-rendert.
- **Bestellnummer = live aus echten Produkt-Orders**, nicht aus gespeichertem Zähler (robust).
- **Mirror-Tombstones** (`recentlyDeleted`, 5 Min) gegen IMPORTRANGE-Verzögerung beim Löschen.
- **Master schreiben = formelsicher:** G/K als Formeln, A/L/M/N/O (Status/Payment/COD) nie überschreiben; Spalten per Header gelesen (robust gegen Verschiebung), beim Schreiben Position-basiert (1-basiert).
- **Fotos:** base64 in separatem Node + leichter Index (nicht im orders-Node).
- **Service Worker network-first**, damit Deploys sofort greifen.
- **UTF-8/Thai:** Niemals PowerShell für `index.html` (zerschießt Thai). Nur Edit/Write-Tool.

---

## 6. Offene Punkte / To-Do für künftige Sessions

- **Code.gs neu deployen** für „Quick-paste → Spalte R" (Web-App-Projekt, neue Version). Bis dahin bleibt R leer (Rest funktioniert).
- **master-onedit.gs / extract-columns.gs** müssen im **gebundenen Master-Sheet-Skript** liegen, damit der Sheet-Auto-Splitter läuft.
- **KI-Fallback Kundendaten** ist eingebaut aber **aus** (`BOT_PARSE_URL=''`). Bei Bedarf aktivieren (Bot neu deployen + URL eintragen).
- **Firebase Storage** für Fotos wäre langfristig sauberer als base64-in-DB (RTDB 1GB-Limit) — bisher bewusst nicht umgestellt.
- **LINE-Bot „alles fragen"** braucht `ANTHROPIC_API_KEY` im Bot-Projekt (ist gesetzt) und neuen Deploy bei Code-Updates.
- Mögliche Erweiterungen, die angesprochen wurden: Rabatt-Feld in Pre-Order; Pre-Order/Storno-Marker im Sheet für Office-Stornos (rote Zeile → app-seitig automatisch canceln); Management-Umsatz weiter verfeinern.

---

## 7. Deploy-Checkliste (nach Änderungen)

1. **App (`index.html`, `sw.js`):** committen → GitHub Desktop → **Push origin** → im Browser **Strg+Shift+R** (network-first lädt neu).
2. **`Code.gs` (Web-App):** im richtigen Apps-Script-Projekt ersetzen → speichern → **Bereitstellungen verwalten → Neue Version**. IDs/Token bleiben.
3. **`line-bot.gs`:** im LINE-Bot-Projekt ersetzen → **LINE_TOKEN + ANTHROPIC_API_KEY wieder eintragen** → Neue Version bereitstellen.
4. **`master-onedit.gs` / `extract-columns.gs`:** im Master-Sheet (Erweiterungen → Apps Script) einfügen → speichern (onEdit läuft automatisch).
