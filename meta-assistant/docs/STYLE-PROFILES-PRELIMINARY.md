# Vorläufige Stilprofile — Pim, Bobby, Lanoy (Stand 10.07.2026)

Erstellt aus einem **Live-Blick** in den echten Business-Suite-Posteingang (kp.wallpanel),
nicht aus gespeicherten Samples — das Backend ist noch nicht deployed. Kunden-PII maskiert.
**Konfidenz** je Person unten angegeben; das sind Startprofile, keine fertige Analyse.

## Wichtiger Kontext (gilt für alle)
- Der Posteingang läuft stark über **Textbausteine / Automatik**: „สต๊อกสินค้า พร้อมส่งของวันนี้ค่ะ",
  Produkt-Bildkarten, Promo „โปร ฯ เดือนนี้ – ฟรีค่าขนส่ง 25 แผ่นขึ้นไป …". Diese Vorlagen nutzen
  **ค่ะ** und tragen **keine** Personen-Zuordnung → sie sagen nichts über persönlichen Stil und
  sind hier ausgeschlossen.
- Chats werden **nicht** immer von einer Person allein bearbeitet — mehrere Mitarbeiter mischen sich
  in denselben Chat (verifiziert). Die Zuordnung ist nur für die **letzte** Antwort-Serie sicher.

## Mapping
| Spitzname | Facebook-Name |
|---|---|
| Pim | Pimlada Rattana |
| Bobby | วุฒิศักดิ์ ปราบวงษา |
| Lanoy | Lanoy Add |

---

## Lanoy (Lanoy Add) — Konfidenz: mittel
Bearbeitet die **meisten** Chats. Männliche Ansprache.

- **Höflichkeitspartikel:** ครับ
- **Ton:** beratend und **ehrlich** — verkauft nicht um jeden Preis. Belegt an einer echten Antwort:
  auf „habt ihr WPC für außen?" sagt er, 100% Außen gäbe es noch nicht, empfiehlt es für überdachte
  Bereiche / Carport-Wände, **rät aber ausdrücklich ab** für Zäune / frei bewitterte Wände
  („แต่ถ้าเอาไปทำรั้ว … แบบนี้ไม่แนะนำ ครับ").
- **Form:** gliedert Antworten in **mehrere kurze Zeilen** statt eines Blocks; nennt konkrete
  Einsatzfälle. Emojis sparsam.
- **Für den Assistenten:** ausführlicher, konsultativer Modus; darf auf Nachteile/Grenzen hinweisen
  und Alternativen vorschlagen.

```json
{ "staff":"Lanoy Add","nickname":"Lanoy","particle":"ครับ",
  "tone":"consultative, honest, will advise against unsuitable uses",
  "form":"answers split into several short lines; names concrete use-cases",
  "emojiUsage":"sparing",
  "examples":["ภายนอก 100% ยังไม่มีนะครับ","สินค้าที่ร้าน จะแนะนำในส่วนที่เป็น ฝาโรงรถ / ผนัง ที่อยู่ได้ชายคา","แต่ถ้าเอาไปทำรั้ว กันกำแพงข้างบ้าง แบบนี้ไม่แนะนำ ครับ"],
  "confidence":"medium" }
```

## Bobby (วุฒิศักดิ์ ปราบวงษา) — Konfidenz: mittel-niedrig
Männliche Ansprache. Kürzer und operativer als Lanoy.

- **Höflichkeitspartikel:** ครับ, oft **„ครับผม"** (warm/zuvorkommend).
- **Ton:** knappe, prompte **Bestätigungen** rund um Versand/Ablauf.
- **Belege:** „น่าจะส่งวันอังคารครับ" (dürfte Dienstag rausgehen), „เดี๋ยวแจ้งไปครับ" (melde mich gleich),
  „ครับผม" (ok/gern).
- **Für den Assistenten:** kurzer, freundlich-effizienter Bestätigungsmodus; wenig Ausschmückung.

```json
{ "staff":"วุฒิศักดิ์ ปราบวงษา","nickname":"Bobby","particle":"ครับ (often ครับผม)",
  "tone":"brief, prompt operational confirmations",
  "form":"short one-liners about shipping/next steps; little elaboration",
  "emojiUsage":"minimal",
  "examples":["น่าจะส่งวันอังคารครับ","เดี๋ยวแจ้งไปครับ","ครับผม"],
  "confidence":"medium-low" }
```

## Pim (Pimlada Rattana) — Konfidenz: unzureichend
Weibliche Ansprache (vermutlich ค่ะ), aber **noch kein belastbarer Freitext erfasst**: die
sichtbaren Antworten in ihren Chats waren Textbausteine, Produkt-Bildkarten und Sticker
(„เพ็ญโสภา hat einen Sticker gesendet"). Für ein echtes Profil muss über den laufenden Betrieb
gesammelt werden.

```json
{ "staff":"Pimlada Rattana","nickname":"Pim","particle":"ค่ะ (assumed)",
  "tone":"UNKNOWN — only templates/images/stickers observed so far",
  "confidence":"insufficient",
  "todo":"collect real free-text replies via the deployed backend before building a profile" }
```

---

## Nächster Schritt
Diese Startprofile können nach dem Backend-Deploy direkt `assistant/styleProfiles/<key>/current`
seeden. Danach verfeinert sich alles automatisch über gesammelte Samples + Korrekturen
(`buildStyleDraft('Bobby')` → Review → `promoteStyleDraft('Bobby')`). **Pim** braucht als Erstes
echte Freitext-Samples — ihr Profil hier bewusst leer statt geraten.
