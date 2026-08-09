# FlowAccount-Anbindung einrichten (Sandbox zuerst)

Der 🧾-Tax-Invoice-Knopf an der Order legt die Rechnung **in FlowAccount** an
(gleiche INV-Serie, gleicher VAT-Report) und druckt das zurückkommende PDF.
Damit die Zugangsdaten nie im Browser landen, läuft alles über ein kleines
Apps-Script-Relay — dasselbe Muster wie die Chat-Übersetzung.

## 1. Zugangsdaten bei FlowAccount holen

1. In FlowAccount einloggen → **MyCompany → Connections** (การเชื่อมต่อ)
2. **client-id** und **client-secret** kopieren
   (falls der Bereich fehlt: der Tarif hat keinen API-Zugang → FlowAccount-Support fragen)

## 2. Relay deployen

1. https://script.google.com → Neues Projekt → Inhalt von `flowaccount.gs` einfügen
2. ⚙️ **Project Settings → Script properties** anlegen:
   | Property | Wert |
   |---|---|
   | `FA_CLIENT_ID` | *(aus Schritt 1)* |
   | `FA_CLIENT_SECRET` | *(aus Schritt 1)* |
   | `FA_MODE` | `sandbox` |
3. **Deploy → New deployment → Web app** · Execute as **Me** · Access **Anyone** → **/exec-URL kopieren**

## 3. URL in die App eintragen

In `index.html` die Konstante füllen:

```js
var KP_FLOWACCOUNT_URL = 'https://script.google.com/macros/s/…/exec';
```

Committen/pushen — fertig. Der 🧾-Knopf erscheint auf den Orderkarten von selbst,
sobald die URL gesetzt ist.

## 4. Testen (Sandbox)

1. Relay-Check im Browser: `<exec-URL>?action=health` → muss `{"ok":true,"mode":"sandbox"…}` zeigen
2. In der App an einer beliebigen Order **🧾 Tax Invoice** → TIN eingeben → erstellen
3. Ergebnis im **Sandbox-Portal** anschauen: https://sandbox-new.flowaccount.com
   — Beleg da? Beträge/VAT richtig? PDF-Layout ok?
4. Erst wenn alles passt: Script property `FA_MODE` auf `live` stellen
   (neu deployen nicht nötig — Properties wirken sofort)

## Störungsfälle

- `token 400/401` → client-id/secret falsch oder Tarif ohne API
- `api 404 …/tax-invoices…` → Basis-URL passt nicht zum Account; mit
  `FA_BASE_SANDBOX` / `FA_BASE_LIVE` übersteuerbar, Werte stehen im
  FlowAccount-Entwicklerportal (developers.flowaccount.com)
- Beleg entsteht, aber `pdfError` → Rechnung existiert in FlowAccount,
  nur der PDF-Abruf hakte; „nochmal drucken" auf der Karte versucht es erneut

**Nie** client-id/secret in die App, ins Repo oder in den Chat kopieren —
sie leben ausschließlich in den Script properties.
