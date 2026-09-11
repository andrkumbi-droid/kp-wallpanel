# Einbau auf den Büro-Rechnern / ติดตั้งบนคอมพิวเตอร์ออฟฟิศ

Es arbeiten 4–6 Leute im Posteingang — jeder Rechner braucht die Erweiterung einmal.
มีพนักงาน 4–6 คน ต้องติดตั้งส่วนขยายนี้ในคอมพิวเตอร์ของทุกคน

## Was sie macht / ทำอะไร

Im Chat der Business Suite steht rechts das Feld **KP Sortiment** mit einem Knopf:
**📦 ส่งรูปสินค้าทั้งหมด**. Ein Klick schickt alle Produkte, die gerade wirklich
lieferbar sind, als Fotos — automatisch in 10er-Schüben, weil Meta nur 10 Bilder
pro Nachricht nimmt.

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

### Einmal ausprobieren, bevor es zum Kunden geht

Den Haken **„ทดสอบ: ใส่รูปแต่ยังไม่ส่ง / nur einfügen"** setzen und den Knopf
drücken: es landen dann 10 Bilder im Antwortfeld, **gesendet wird nichts**. Sieht
das gut aus: Bilder mit ✕ wieder wegklicken, **Haken raus** — ab dann sendet der
Knopf wirklich. Der Haken merkt sich seinen Stand, im Alltag bleibt er aus.

## Updates verteilen / อัปเดต

- Drive-Ordner aktualisiert sich von selbst → jeder Rechner: `chrome://extensions`
  → auf der Kachel **⟳** klicken (oder Chrome neu starten).
- **Besser auf Dauer:** die Erweiterung einmal als **„unlisted" in den Chrome Web
  Store** stellen (einmalig 5 USD Entwicklergebühr, ein paar Tage Prüfung). Dann
  installiert jeder sie über einen Link und **Chrome aktualisiert von selbst**.

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

Die ganze DOM-Kenntnis steckt in `extension/content/selectors.js` — ändert Meta
etwas, wird **nur diese Datei** angefasst.

## Abgeschaltet: Übersetzer und Stil-Lernen

Übersetzung, Antwortvorschläge und das Stil-Lernen sind seit 11.09.2026 aus dem
Panel raus (Wunsch des Büros). Der Code liegt weiter im Repo als
`content/overlay-assistant.js.off`, `inbox-live.js.off`, `composer.js.off`,
`inbox-observer.js.off`; zum Wiedereinschalten die Endung `.off` entfernen und die
Dateien in `manifest.json` unter `content_scripts` wieder eintragen (dann braucht
es auch wieder Backend-URL und Token in einer Optionsseite). Das Apps-Script-
Backend läuft unberührt weiter.
