# FlowAccount-Anbindung einrichten (Sandbox zuerst)

Der 🧾-Tax-Invoice-Knopf an der Order legt die Rechnung **in FlowAccount** an
(gleiche INV-Serie, gleicher VAT-Report) und druckt das zurückkommende PDF.
Damit die Zugangsdaten nie im Browser landen, läuft alles über ein kleines
Apps-Script-Relay — dasselbe Muster wie die Chat-Übersetzung.

## 1. Zugangsdaten bei FlowAccount holen

Für die **Sandbox** kommen sie per Mail vom OpenAPI-Team
(`developer_support@flowaccount.com`) — dort stehen `Client_id`, `Client_secret`
und der Token-Link. Für **live** später: FlowAccount → **MyCompany → Connections**
(การเชื่อมต่อ); fehlt der Bereich, hat der Tarif keinen API-Zugang (Open API gibt
es nur im Paket Pro Business).

### Sandbox und live unterscheiden sich NUR am Token-Endpunkt

Am 26.08.2026 gegen den echten Host geprüft (ohne Zugangsdaten):

| Aufruf | Antwort | heißt |
|---|---|---|
| `POST /test/token` | `200 {"error":"invalid_client"}` | Sandbox-Tür, offen |
| `POST /token` | `403 {"message":"Forbidden"}` | live, für uns zu |
| `/v3-alpha/th/tax-invoices…` mit falschem Bearer | `401` | Pfad existiert |
| `/sandbox/…` | `403` | hat es nie gegeben |

Die API-Pfade sind also für beide `…/v3-alpha`; **welche Firma** man bearbeitet,
entscheidet allein der Token. Deshalb ist der Default jetzt
`FA_MODE=sandbox → https://openapi.flowaccount.com/test/token`.

## 2. Relay deployen

1. https://script.google.com → Neues Projekt → Inhalt von `flowaccount.gs` einfügen
2. ⚙️ **Project Settings → Script properties** anlegen:
   | Property | Wert |
   |---|---|
   | `FA_CLIENT_ID` | *(aus Schritt 1)* |
   | `FA_CLIENT_SECRET` | *(aus Schritt 1)* |
   | `FA_MODE` | `sandbox` |

   Läuft ein Relay noch mit dem **alten** Code (Deploy vor dem 26.08.2026), kommen
   diese zwei dazu — dann sind sie richtig eingestellt, ohne neu zu deployen:
   | `FA_TOKEN_URL` | `https://openapi.flowaccount.com/test/token` |
   | `FA_BASE_SANDBOX` | `https://openapi.flowaccount.com/v3-alpha` |
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

## 5. Steuernummer-Suche (กรมสรรพากร)

Im 🧾-Dialog steht die **13-stellige Steuernummer ganz oben**. Sobald sie
vollständig ist (oder auf 🔍 ค้นสรรพากร), holt die App **Firmenname und
Registeradresse direkt vom Finanzamt** und schreibt sie in die Felder — dasselbe,
was FlowAccount als „Search from the RD's database" anbietet. Name und Adresse
aus der Order sind nur Liefername/Lieferadresse und taugen nicht für die
Steuerrechnung; ein Klick auf „↩ ใช้ข้อมูลจากออเดอร์" holt sie zurück.

Der Dienst (`rdws.rd.go.th/serviceRD3/vatserviceRD3.asmx`) ist öffentlich, aber
SOAP und ohne CORS-Header — deshalb läuft er über dieses Relay
(`{"action":"tin","tin":"…","branch":0}`), Antwort 6 h im Cache. Er braucht
**keine** FlowAccount-Zugangsdaten und funktioniert auch, solange die noch fehlen.

⚠️ Dafür muss `flowaccount.gs` **neu deployt** werden (Apps Script → Datei neu
einfügen → Bereitstellen → *Bereitstellung verwalten* → Bearbeiten → neue
Version). Ohne das antwortet das Relay `unknown action`, und im Dialog steht rot
„❌ unknown action" — Name und Adresse lassen sich dann von Hand eintippen.

Nicht jede Nummer ist auffindbar: Wer nicht in der VAT-Registrierung steht,
liefert „ไม่พบข้อมูลที่ต้องการค้นหา / Data not found".

## Störungsfälle

- `token 400/401` → client-id/secret falsch oder Tarif ohne API
- `api 404 …/tax-invoices…` → Basis-URL passt nicht zum Account; mit
  `FA_BASE_SANDBOX` / `FA_BASE_LIVE` übersteuerbar, Werte stehen im
  FlowAccount-Entwicklerportal (developers.flowaccount.com)
- Beleg entsteht, aber `pdfError` → Rechnung existiert in FlowAccount,
  nur der PDF-Abruf hakte; „nochmal drucken" auf der Karte versucht es erneut

**Nie** client-id/secret in die App, ins Repo oder in den Chat kopieren —
sie leben ausschließlich in den Script properties.
