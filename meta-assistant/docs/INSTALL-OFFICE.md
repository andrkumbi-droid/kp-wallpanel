# Einbau auf den Büro-Rechnern / ติดตั้งบนคอมพิวเตอร์ออฟฟิศ

Es arbeiten 4–6 Leute im Posteingang — jeder Rechner braucht die Erweiterung einmal.
มีพนักงาน 4–6 คน ต้องติดตั้งส่วนขยายนี้ในคอมพิวเตอร์ของทุกคน

## Was der neue Knopf macht / ปุ่มใหม่ทำอะไร

Im Chat der Business Suite: **📦 ส่งรูปสินค้าทั้งหมด** schickt alle Produkte, die
gerade **wirklich lieferbar** sind, als Fotos — automatisch in 10er-Schüben,
weil Meta nur 10 Bilder pro Nachricht nimmt.

- **Keinen Bilderordner mehr pflegen.** Die Liste kommt aus der KP-App
  (`pub/chatCatalog`): was einen Lagersatz hat und nicht ausverkauft ist.
- **Ausverkauft in der App = sofort raus**, bei allen Arbeitsplätzen gleichzeitig.
- Produkte **ohne Foto** werden am Ende namentlich gemeldet — die müssen noch
  fotografiert und als `img/products/<CODE>.jpg` ins Repo gelegt werden.

## Installation (heute, ohne Chrome Web Store)

1. Den Ordner `meta-assistant/extension` auf einen **gemeinsamen Google-Drive-Ordner**
   legen, der auf allen Büro-Rechnern synchronisiert wird (Drive für Desktop).
2. Auf jedem Rechner in Chrome: `chrome://extensions` öffnen
3. Oben rechts **Entwicklermodus** einschalten / เปิด Developer mode
4. **„Entpackte Erweiterung laden"** → den Ordner `extension` auswählen
5. Fertig. Im Posteingang erscheint rechts das Panel **KP Assistant**.

**Der Foto-Versand braucht keine weitere Einrichtung** — er liest nur öffentliche
Daten. Die Optionen (Backend-URL + Token) sind nur für Übersetzen und
Antwortvorschläge nötig.

### Erster Test auf jedem Rechner

Den Haken **„ทดสอบ: ใส่รูปแต่ยังไม่ส่ง / nur einfügen"** stehen lassen und den Knopf
drücken: es dürfen dann 10 Bilder im Antwortfeld liegen, **gesendet wird nichts**.
Sieht das gut aus, Haken raus — ab da sendet der Knopf wirklich.

## Updates verteilen / อัปเดต

- Drive-Ordner aktualisiert sich von selbst → jeder Rechner: `chrome://extensions`
  → auf der Kachel **⟳** klicken (oder Chrome neu starten).
- **Besser auf Dauer:** die Erweiterung einmal als **„unlisted" in den Chrome Web
  Store** stellen (einmalig 5 USD Entwicklergebühr, ein paar Tage Prüfung). Dann
  installiert jeder sie über einen Link und **Chrome aktualisiert von selbst** —
  kein Drive-Ordner, kein ⟳ auf sechs Rechnern.

## Wenn etwas klemmt / ถ้ามีปัญหา

| Meldung | Bedeutung |
|---|---|
| `⚠ ไม่พบช่องพิมพ์ — เปิดแชทไว้หรือยัง?` | Kein Chat offen — erst eine Unterhaltung anklicken |
| `⚠ ใส่รูปไม่สำเร็จ (input/paste/drop)` | Meta hat das Markup geändert → `extension/content/selectors.js` nachziehen |
| `⚠ โหลดรายการสินค้าไม่ได้` | `pub/chatCatalog` fehlt — die KP-App (Office-Tab) einmal öffnen, sie schreibt die Liste |
| `⚠ ยังไม่มีรูป: KP0xx` | Diese Produkte haben kein Foto im Repo |

Die ganze DOM-Kenntnis steckt in `extension/content/selectors.js` — ändert Meta
etwas, wird **nur diese Datei** angefasst.
