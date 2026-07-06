# KP Meta Assistant — Konzept (Phase 0/1)

KI-Kundenservice-Assistent für die Meta Business Suite: übersetzt eingehende
Thai-Nachrichten, erzeugt 2–3 natürliche Thai-Antwortvorschläge (grounded in
Live-App-Daten + Firmen-Stilprofil), fügt die gewählte Antwort ins Antwortfeld
ein. **Human-in-the-loop: gesendet wird immer manuell.**

## Entscheidungen (07.07.2026)

| Frage | Entscheidung |
|---|---|
| Integration | **Extension-DOM** (MV3) fürs MVP; offizielle Messaging-API erst Phase 4 (bräuchte App-Review + eigenes Inbox-UI) |
| Backend | **Apps Script** `apps-script/meta-assistant.gs` — eigenes Web-App-Deployment, Muster aus `line-bot.gs` |
| API-Key | **Neuer eigener Anthropic-Key** (nicht der line-bot-Key) |
| Provider | Abstraktion in `meta-assistant.gs` (`PROVIDERS`), Default Claude (`claude-sonnet-5`), OpenAI als Alternative |
| Sprache | Übersetzung/Rückübersetzung **umschaltbar DE/EN, Default DE** (Toggle im Overlay) |
| Stil-Lernen | Generisches Startprofil jetzt; **Sammelmodus** in der Extension ab Live-Zugang; Lernen immer review-gated |
| Kanal | Facebook-Seite (kp.wallpanel); IG/WhatsApp später über denselben Posteingang |

## Architektur

```
Business Suite (Browser)                Apps Script                Firebase RTDB
┌──────────────────────┐   POST JSON   ┌──────────────────┐        (bestehende App-DB)
│ content scripts       │  ──────────► │ meta-assistant.gs │ ─────► stockItems, orders,
│  inbox-observer       │   via sw.js  │  · translate      │        customerMeta (read)
│  overlay (UI)         │ ◄──────────  │  · suggest        │ ─────► assistant/* (r/w)
│  composer (einfügen)  │              │  · style/correct. │        └ styleProfile,
│ KEINE Keys hier       │              │  Anthropic-Key    │          knowledgeStatic,
└──────────────────────┘              └──────────────────┘          productCatalog,
                                                                     styleSamples,
                                                                     corrections
```

- **Keys nur in Apps Script.** Extension kennt nur die /exec-URL + Shared Token (Options-Seite).
- **Selektoren nur in `extension/content/selectors.js`** — bricht Meta das DOM, ist das die einzige Baustelle.
- **Fixture-first:** `fixtures/inbox-snapshot.html` + `dev-shim.js` = kompletter UI-Flow offline testbar (Mock-Antworten oder echtes Backend via `localStorage.kpBackendUrl`).

## Datenmodell (Firebase, unter `assistant/` — außerhalb des saisonalen v2/-Präfix)

- `assistant/styleProfile/current` — aktives Stilprofil (Partikel, Anrede, Begrüßungen, Emoji-Regeln, Rabatt-/Absage-Stil). **Getrennt vom Sachwissen.**
- `assistant/styleProfile/drafts/<ts>` — von `buildStyleDraft` erzeugt; erst nach deinem Review via `promoteStyleDraft()` aktiv.
- `assistant/knowledgeStatic` — Garantie, Versand, FAQ (manuell, `seedKnowledge()` legt TODO-Gerüst an).
- `assistant/productCatalog` — Spiegel von `QT_PRODUCTS`, schreibt die App selbst (Hook in `qtRebuildProducts`, index.html). Single Source of Truth bleibt der App-Code.
- `assistant/styleSamples` — vom Sammelmodus gescrapte Paare (Kunde→Mitarbeiter), PII maskiert (Client + Server).
- `assistant/corrections` — Vorschlag→editiert-Paare (Overlay loggt bei Blur nach Einfügen). Nur Log; fließt erst über Draft+Review ins Profil.

Live-Wissen (`stockItems`, `orders` für Kundenhistorie) liest das Backend direkt — keine zweite Datenbank. Kunden-Match: Meta-Profilname ↔ `orders.customer` (fuzzy), da Meta keine Telefonnummer liefert.

## Setup (einmalig)

1. `meta-assistant.gs` in ein **neues** Apps-Script-Projekt, neuen Anthropic-Key + `SHARED_TOKEN` setzen, `seedStyleProfile()` + `seedKnowledge()` im Editor ausführen, als Web-App deployen (Execute as Me / Anyone).
2. `knowledgeStatic`-TODOs in Firebase mit echten Werten füllen.
3. Extension laden: chrome://extensions → Entwicklermodus → „Entpackt laden" → `meta-assistant/extension`. Options-Seite: /exec-URL + Token.
4. App einmal öffnen → `assistant/productCatalog` wird befüllt.

## Morgen (mit Meta-Zugang): Selector discovery

1. Posteingang öffnen → DevTools → auf einer Kundennachricht „Inspect": stabile Merkmale von Nachrichtenzeile, Richtung (in/out), Textknoten, Antwortfeld (`div[role="textbox"]`?), Kundenname notieren.
2. Reale Selektoren als **zweiten Eintrag** in `selectors.js` eintragen (Fixture-Selektoren bleiben Eintrag 1).
3. Rechtsklick → „Save as… (complete)" auf dem Posteingang → als echtes Fixture neben `inbox-snapshot.html` legen.
4. End-to-End: neue Nachricht → Auto-Übersetzung → Vorschläge → Einfügen (Insert-Pfade in `composer.js` testen; Lexical-Editoren brauchen ggf. Anpassung).

## Offene Punkte

- **Partikel ครับ vs ค่ะ:** Startprofil steht auf ค่ะ (übliche Admin-Persona) — bestätigen oder in `assistant/styleProfile/current` ändern.
- Auto-Send (Phase 4) bewusst nicht gebaut.
- Retention `corrections`/`styleSamples`: Vorschlag 90 Tage, noch nicht automatisiert.
