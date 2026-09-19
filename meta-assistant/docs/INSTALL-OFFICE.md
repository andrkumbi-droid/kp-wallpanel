# Einbau auf den Büro-Rechnern / ติดตั้งบนคอมพิวเตอร์ออฟฟิศ

Es arbeiten 4–6 Leute im Posteingang — jeder Rechner braucht die Erweiterung einmal.
มีพนักงาน 4–6 คน ต้องติดตั้งส่วนขยายนี้ในคอมพิวเตอร์ของทุกคน

## Was sie macht / ทำอะไร

Im Chat der Business Suite **und im LINE Official Account Manager** (chat.line.biz)
steht rechts das Feld **KP Sortiment** mit einem Knopf:
**📦 ส่งรูปสินค้าทั้งหมด**. Ein Klick schickt alle Produkte, die gerade wirklich
lieferbar sind, als Fotos — automatisch in 10er-Schüben, weil beide Seiten nur
10 Bilder pro Nachricht nehmen.

> **Neu seit 19.09.2026: LINE.** Dieselbe Erweiterung, dieselbe Bedienung, dieselbe
> Produktliste. Auf LINE ist der Versand deutlich schneller (ein paar Sekunden
> statt einer Minute) und LINE zeigt vor dem Absenden noch einen eigenen Dialog
> mit allen Bildern — der wird automatisch bestätigt.
>
> **Dieses Update braucht einmalig das ⟳ auf `chrome://extensions`**, weil sich die
> `manifest.json` geändert hat. Sonst greift LINE nicht. Danach reicht wieder F5.
> / ต้องกด ⟳ ที่ `chrome://extensions` หนึ่งครั้ง

- **Kein Bilderordner mehr.** Die Liste kommt aus der KP-App (`pub/chatCatalog`):
  was einen Lagersatz hat und nicht ausverkauft ist.
- **Ausverkauft in der App = sofort raus**, auf allen Arbeitsplätzen gleichzeitig.
- **Neues Produkt = automatisch dabei**, sobald sein Foto als
  `img/products/<CODE>.jpg` im Repo liegt. Fehlt das Foto, nennt die Statuszeile
  den Code am Ende des Laufs.
- Ein Lauf dauert etwa eine Minute. Dabei **den Chat nicht wechseln**.

## Installation

1. Den Ordner `meta-assistant/extension` in einen **gemeinsamen Google-Drive-Ordner**
   legen, der auf allen Büro-Rechnern synchronisiert wird (Drive für Desktop).
2. Auf jedem Rechner in Chrome: `chrome://extensions` öffnen
3. Oben rechts **Entwicklermodus** einschalten / เปิด Developer mode
4. **„Entpackte Erweiterung laden"** → den Ordner `extension` auswählen
5. Fertig. **Keine weitere Einrichtung** — kein Konto, kein Passwort, kein Token.
   Die Erweiterung liest nur die öffentliche Produktliste.
6. **War business.facebook.com oder chat.line.biz schon offen: einmal F5 drücken.** Eine Seite, die
   vor der Installation geladen wurde, hat das Panel noch nicht.

### Auswahl: was rausgeht, steht im Panel

Unter dem Knopf liegen alle lieferbaren Produkte als Bildchen, **alle angetickt**.
Ein Klick auf ein Bild wählt es ab (grau), noch ein Klick wieder an. **ทั้งหมด /
alle** und **ไม่เลือก / keine** setzen alles auf einmal. Der Knopf sagt immer, wie
viele Fotos rausgehen. Nach einem Versand sind wieder alle angetickt, damit der
nächste Kunde nicht die Auswahl des vorigen erbt.

### Einmal ausprobieren, bevor es zum Kunden geht

Auf jedem neuen Rechner: einen **eigenen Testchat** öffnen (sich selbst von privat
an die Seite schreiben), **ไม่เลือก / keine** drücken, **ein** Produkt anticken und
senden. Kommt das eine Foto an, stimmt alles.

## Updates verteilen / อัปเดต

**Doppelklick auf `KP-Update.bat`, danach F5 im Posteingang.** Die Datei liegt in
`meta-assistant/tools/` und wird **einmal** verteilt (Desktop des Kollegen); sie
holt die aktuellen Dateien direkt aus dem Repo und legt sie in den Ordner, aus dem
Chrome die Erweiterung wirklich lädt — den liest sie aus Chromes eigener
Aufzeichnung, geraten wird nichts. Kein ZIP mehr, kein Anhang, keine Rückfrage.

Warum meist **kein ⟳** nötig ist: bei einer entpackten Erweiterung liest Chrome die
Content-Skripte (`overlay.js`, `catalog-send.js`, `overlay.css`) bei **jedem
Seitenaufbau** frisch von der Platte. Ein ⟳ auf der Kachel in `chrome://extensions`
braucht es nur, wenn sich die `manifest.json` wirklich ändert (neue Datei, neue
Rechte) oder der Service Worker im Hintergrund.

Gar kein Update nötig ist bei **Produkten, Fotos, Preisen, Ausverkauft und neuen
Rillen-Gruppen** — die kommen über Firebase und GitHub Pages und sind nach einem
F5 da.

**Auf Dauer noch bequemer:** die Erweiterung einmal als **„unlisted" in den Chrome
Web Store** stellen (einmalig 5 USD, ein paar Tage Prüfung). Dann installiert jeder
sie über einen Link und **Chrome aktualisiert von selbst** — und die Meldung
„Erweiterungen im Entwicklermodus deaktivieren" bei jedem Chrome-Start ist weg.

## Wenn etwas klemmt / ถ้ามีปัญหา

| Meldung | Bedeutung |
|---|---|
| `⚠ ไม่พบช่องพิมพ์ — เปิดแชทไว้หรือยัง?` | Kein Chat offen — erst eine Unterhaltung anklicken |
| `⚠ ใส่รูปไม่สำเร็จ (input·paste·drop)` | Meta hat das Markup geändert → `extension/content/selectors.js` nachziehen |
| `⚠ ส่งไม่ออก (knopf·enter·seite)` | Senden-Knopf gefunden, aber er reagiert nicht |
| `⚠ ส่งไม่ออก (kein Knopf gefunden)` | Senden-Knopf nicht gefunden → `KP_SEND_RE` in `selectors.js` |
| `⚠ ใส่รูปได้แค่ 4/10` | Nur ein Teil kam an — Feld leeren und neu starten |
| `⚠ โหลดรายการสินค้าไม่ได้` | `pub/chatCatalog` fehlt — die KP-App (Office-Tab) einmal öffnen |
| `⚠ ยังไม่มีรูป: KP0xx` | Diese Produkte haben kein Foto im Repo |

Nur bei LINE / เฉพาะ LINE:

| Meldung | Bedeutung |
|---|---|
| `⚠ เปิดแชทก่อน / erst einen Chat öffnen` | Kein Chat offen — erst eine Unterhaltung anklicken |
| `… fehlgeschlagen: no_dialog` | LINE hat den Bestätigungsdialog nicht gezeigt → `line-selectors.js` nachziehen |
| `… fehlgeschlagen: LINE nahm nur 7/10` | LINE hat Bilder verworfen; **nichts wurde gesendet**, Auswahl prüfen und neu starten |
| `… fehlgeschlagen: Sorry, you can only send up to 10…` | Sollte nie kommen (wir schicken höchstens 10) — LINE hat sein Limit geändert |
| `⏸ LINE จำกัดการส่งชั่วคราว รอ 20 วิ…` | **Normal.** LINE bremst, wenn kurz hintereinander viel rausgeht. Die Erweiterung wartet von selbst und versucht es zweimal erneut. Nichts anklicken, nur warten |
| `… fehlgeschlagen: You've reached your short-term messaging limit` | Die Sperre hielt auch nach zwei Versuchen an. **Ein paar Minuten warten**, dann neu starten. Was schon rausging, steht in der Meldung davor — nicht doppelt schicken |
| `⚠ N ชุดยังไม่เห็นในแชท` | Gesendet, aber im Verlauf nicht wiedergefunden. **Nicht nochmal senden** — erst im Chat nachsehen |

Die ganze DOM-Kenntnis steckt in `extension/content/selectors.js` (Meta) bzw.
`extension/content/line-selectors.js` (LINE) — ändert eine der beiden Seiten
etwas, wird **nur die jeweilige Datei** angefasst.

## Abgeschaltet: Übersetzer und Stil-Lernen

Übersetzung, Antwortvorschläge und das Stil-Lernen sind seit 11.09.2026 aus dem
Panel raus (Wunsch des Büros). Der Code liegt weiter im Repo als
`content/overlay-assistant.js.off`, `inbox-live.js.off`, `composer.js.off`,
`inbox-observer.js.off`; zum Wiedereinschalten die Endung `.off` entfernen und die
Dateien in `manifest.json` unter `content_scripts` wieder eintragen (dann braucht
es auch wieder Backend-URL und Token in einer Optionsseite). Das Apps-Script-
Backend läuft unberührt weiter.
