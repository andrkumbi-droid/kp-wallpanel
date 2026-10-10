# KP Wallpanel — Firebase security

Bis 2026-07-27 stand die Realtime Database komplett offen (`".read": true, ".write": true`).
Google hat das per Mail gemeldet: *„Jeder Nutzer kann Ihre gesamte Datenbank lesen / darin schreiben."*
Die `databaseURL` steht im Klartext in der öffentlich gehosteten `index.html` — es reichte
also der Aufruf einer URL, um Orders, Kunden, Payroll und Staff-PINs zu lesen oder zu löschen.

## Stufe 1 — **aktiv seit 2026-07-27**

Nachgemessen direkt nach dem Veröffentlichen: unauthentifizierter Zugriff auf
`/v2`, `/v2/orders`, `/v2/staffList`, `/v2/payroll` sowie ein Schreibversuch
liefern **HTTP 401**; `/pub/soldOut` + `/pub/webCatalog` weiterhin **200**;
Live-App liest angemeldet durch. App, TV-Display, Master-Sheet, LINE-Bot,
Landingpage und Order Builder vom Benutzer gegengetestet — alles läuft.

### Zugriff nur noch mit Auth

**Regeln:** [`firebase-rules.json`](firebase-rules.json) — alles braucht `auth != null`,
Ausnahme `pub/` (öffentlich lesbar, weil die Landingpage `pub/soldOut` + `pub/webCatalog`
ohne Login liest; Schreiben dorthin bleibt auth-pflichtig).

**Wer greift auf die DB zu — und wie er sich jetzt anmeldet:**

| Client | Datei | Auth |
|---|---|---|
| App | `index.html` | `signInAnonymously()` direkt nach `initializeApp` |
| TV-Display Lager | `warehouse-display.html` | `signInAnonymously()` vor dem `orders`-Listener |
| Master-Sheet | `master-build.gs`, `Code-combined*.gs` | `?auth=<secret>` via `kpFbAuth_()` |
| LINE-Bot | `line-bot.gs` | `FIREBASE_SECRET` |
| Meta-Assistent | `meta-assistant.gs` | `FIREBASE_SECRET` |
| Landingpage | eigenes Repo | keine — liest nur `pub/` |

Das Geheimnis steht **nirgends im Repo**, sondern in den Script Properties jedes
Apps-Script-Projekts unter dem Schlüssel `FIREBASE_SECRET`.

### Reihenfolge beim Ausrollen (wichtig)

Erst die Clients, dann die Regeln — sonst steht die App zwischendrin.

1. **Anonymous Auth einschalten**
   Firebase Console → Authentication → Sign-in method → **Anonymous** → aktivieren.
   (Ohne das schlägt `signInAnonymously()` mit `auth/admin-restricted-operation` fehl.)
2. **Datenbank-Secret holen**
   Console → ⚙ Projekteinstellungen → Dienstkonten → **Datenbankgeheimnisse** (Legacy) → anzeigen/kopieren.
3. **Secret in die drei Apps-Script-Projekte** eintragen
   Apps Script → ⚙ Projekteinstellungen → Skripteigenschaften → `FIREBASE_SECRET` = *Wert aus Schritt 2*
   (Master-Sheet, LINE-Bot, Meta-Assistent) und die geänderten `.gs`-Dateien einfügen.
4. **App deployen** (`index.html` + `warehouse-display.html` pushen) und **einmal laden**.
   In der Konsole darf **kein** `[FB] anonymous sign-in failed` stehen.
5. **Erst jetzt die Regeln setzen**
   Console → Realtime Database → Regeln → Inhalt von `firebase-rules.json` einfügen → Veröffentlichen.
6. **Prüfen:** App (alle Rollen), TV-Display, Sheet-Menü „Refresh Pre-Orders + Customers",
   LINE-Bot, Landingpage (Sold-out-Kacheln).

Solange Anonymous Auth aus ist, laufen die Clients weiter wie bisher: der Anmelde-Fehler
wird abgefangen und die Listener starten trotzdem — mit den alten offenen Regeln.
Der Bruch entsteht erst, wenn Schritt 5 vor Schritt 1–4 kommt.

### Rollback

Regeln in der Console zurück auf `{"rules":{".read":true,".write":true}}` — die Clients
funktionieren mit und ohne Auth-Token.

## Was Stufe 1 leistet — und was nicht

**Leistet:** Scanner, die nur die DB-URL kennen, kommen nicht mehr rein. Das war der
akute Befund aus der Google-Mail.

**Leistet nicht:** Der API-Key steht öffentlich im HTML. Wer ihn nimmt, kann sich selbst
anonym anmelden und hat dann wieder vollen Zugriff. Anonyme Auth allein ist eine Hürde,
keine Mauer.

## Zweite Google-Mail, 2026-08-16

*„Jeder **angemeldete** Nutzer kann Ihre gesamte Datenbank lesen / darin schreiben."*

Kein neuer Befund, sondern die Folge von Stufe 1: Google liest die Regel `auth != null`,
sieht anonyme Anmeldung aktiviert — und für Google ist jeder anonyme Gast ein Nutzer.
Das ist exakt die Lücke, die oben unter *„Leistet nicht"* steht.

Wichtig zu trennen:

| Ziel | Was es braucht |
|---|---|
| Daten wirklich schützen | **Stufe 1b — App Check** (unten) |
| Die Mail beenden | **Stufe 3** — erst wenn die Regel nicht mehr pauschal `auth != null` heißt, ist Google zufrieden. App Check ändert die Regel nicht, die Mail kommt also weiter. |

## Stufe 1b — App Check (Code steht, Console fehlt)

Der Code ist eingebaut und **inaktiv**, solange kein Site-Key eingetragen ist:

| Datei | Stelle | SDK |
|---|---|---|
| `index.html` | `APPCHECK_SITE_KEY` im Head-IIFE, direkt nach `initializeApp` | `firebase-app-check-compat.js` 10.12.0 |
| `warehouse-display.html` | `APPCHECK_SITE_KEY` vor dem ersten `db.ref()` | `firebase-app-check.js` 8.10.1 |

Leerer Key = `activate()` wird nie aufgerufen = alles läuft wie heute. Eine halbfertige
Einrichtung kann die Live-App also nicht aussperren.

### Reihenfolge (wichtig — Erzwingen zuletzt)

1. **Console → App Check → Apps** → diese Web-App registrieren, Anbieter **reCAPTCHA v3**.
   Google zeigt dabei zwei Schlüssel — gebraucht wird der **Site-Key** (der öffentliche).
2. Site-Key in **beide** Dateien eintragen (derselbe Wert) und deployen.
3. **Debug-Token für lokal**: `serve.ps1`/localhost ist keine reCAPTCHA-Domain. Der Code
   schaltet dort automatisch den Debug-Modus an; beim ersten Laden steht ein Token in der
   Browser-Konsole → App Check → Apps → ⋮ → **Debug-Tokens verwalten** → eintragen.
   Niemals ein Debug-Token für die Live-Domain anlegen.
4. **2–3 Tage warten** und **App Check → APIs → Realtime Database** beobachten. Erst wenn
   dort praktisch nur noch *verifizierte* Anfragen stehen, ist alles umgestellt.
   Genau hier zeigt sich auch, ob der alte TV-Browser im Lager mitkommt.
5. **Dann erst „Erzwingen"** für die Realtime Database einschalten.

### Zwei Fallen, beide beim Einrichten am 2026-08-16 aufgelaufen

**1. `activate()` darf nicht im `<head>` laufen.** App Check hängt einen unsichtbaren
reCAPTCHA-Container an `document.body` — im Head existiert der noch nicht, der Aufruf wirft
`Cannot read properties of null (reading 'appendChild')`. Das `try/catch` schluckt den Fehler,
App Check startet stillschweigend nie. `index.html` wartet deshalb auf den Body; in
`warehouse-display.html` steht der Block ohnehin im Body.

**2. Ohne gültiges Token hängt die Datenbank, sie scheitert nicht.** Gemessen mit nicht
eingetragenem Debug-Token: `.info/connected` stand nach 172 Sekunden noch auf `false`, kein
Lesevorgang kam zurück, im Netzwerk-Log endlos `…:exchangeDebugToken` → 403. Kein Fehler in
der Oberfläche, die App bleibt einfach leer. Wichtig fürs Verständnis: erreicht ein Gerät
`google.com/recaptcha` nicht (Werbeblocker, Firmen-DNS), sieht das genauso aus — **auch ohne
eingeschaltetes Erzwingen**. Bei „App zeigt keine Daten" also zuerst hierauf prüfen.

**3. Aus einem automatisierten Browser kommt immer 403.** reCAPTCHA v3 bewertet den Besucher,
und ein ferngesteuerter Browser wird als Bot eingestuft — `exchangeRecaptchaV3Token` antwortet
mit 403, danach drosselt das SDK. Das sieht exakt aus wie ein falscher Schlüssel, ist aber die
Prüfung, die ihre Arbeit tut. Gegenprobe immer in einem normalen Browserfenster: dort kam auf
`andrkumbi-droid.github.io` sofort ein Token mit 944 Zeichen.

Apps Script (Master-Sheet, LINE-Bot, Meta-Assistent) meldet sich mit dem Legacy-Secret an.
Das ist eine Admin-Anmeldung und umgeht Regeln wie App Check — die Skripte sollten also
unberührt bleiben. Vor Schritt 5 trotzdem in den Metriken gegenprüfen, statt darauf zu wetten.

**Rollback:** „Erzwingen" wieder aus (wirkt sofort), notfalls Site-Key im Code leeren.

## Nächste Stufen

- **Stufe 1c — Storage-Regeln**: Der Bucket (`storageBucket`) dürfte genauso offen sein.
  `allow read, write: if request.auth != null;` — geteilte Download-URLs mit Token
  funktionieren weiterhin, die sind Token-basiert und regelunabhängig.
- **Stufe 2 — Pfad-Regeln**: `staffList`/`payroll`/`bills` nur für Management, Audit-Log
  append-only (kein Überschreiben/Löschen).
- **Stufe 3 — echte Nutzer-Auth**: pro Mitarbeiter ein Firebase-Login (Custom Token aus
  Apps Script, Rolle als Claim). Erst damit ist die Rollentrennung serverseitig echt —
  heute ist der PIN-Login reine UI.

## Sales-Partner-Konten — **aktiv seit 2026-10-10**

`sales.html` lässt externe Verkäufer sich mit E-Mail + Passwort anmelden. Solche Konten
(`sign_in_provider == 'password'`) bekommen **nicht** mehr den Vollzugriff von `auth != null`,
sondern nur: eigenes `sales/members/<uid>` (Status nicht selbst änderbar), eigene
`sales/requests/<uid>/` (neu anlegen nur als `pending` und nur wenn freigegeben),
`sales/config`, Orders mit `salesUid == uid`, sowie Katalog/Stock/soldOut wenn freigegeben;
`pushQueue` nur neue Einträge an `office`. Anonyme Anmeldung (App, POS, TV) unverändert.
**Bleibt offen:** wer sich bewusst anonym anmeldet, hat weiter Vollzugriff → Stufe 3.
Deploy: `firebase deploy --only database --project kp-wallpanel` aus einem Ordner mit
`firebase.json` → `"database":{"rules":"firebase-rules.json"}` (Git-Bash: `MSYS_NO_PATHCONV=1`).

## Stufe 3a — KP-Gerätezugang (ab 2026-10-11)

**Ziel:** Anonyme Anmeldung darf nicht mehr die ganze Datenbank öffnen. Der API-Key ist
öffentlich, jeder (z. B. ein Sales-Partner) könnte sich sonst anonym anmelden und alles lesen.

**Lösung:** ein gemeinsames KP-Gerätekonto `kp-device@kp-wallpanel.firebaseapp.com`
(E-Mail/Passwort). Das Passwort ist der **Gerätecode** `XXXX-XXXX-XXXX` (12 Zeichen aus 31,
≈ 59 Bit). Jedes KP-Gerät gibt ihn **einmal** ein — im gelben/roten Balken, den `kp-auth.js`
zeigt, unter Management → 🔐 *อุปกรณ์ / Device access*, oder per Link `…#kpdev=CODE`.
Danach bleibt das Gerät dauerhaft angemeldet (Firebase-Persistenz). Der PIN-Login der App ist
unverändert — das hier ersetzt nur die Firebase-Anmeldung.

| Datei | Rolle |
|---|---|
| `kp-auth.js` | `kpAuthEnsure(page,{prompt})` statt `signInAnonymously()`; Balken; Telemetrie `kpAuth/seen`; Management-Helfer (`kpAuthCreate`, `kpAuthCode`, `kpAuthRotate`, `kpAuthSetupLink`) |
| `index.html`, `index-test.html`, `pos.html`, `tour.html`, `moulds.html`, `warehouse-display(-test).html`, `kp-order-builder` | nutzen `kpAuthEnsure` |
| `invest.html` | `prompt:'never'` (externer Investor — Lösung für Phase B offen) |
| `sales.html` | Owner-Seite `prompt:'locked'`; das Gerätekonto ist nie ein Partner; Partner-Login nur auf kp-sales.web.app (github.io leitet um, sonst überschreibt ein Partner-Login die Gerätesitzung des ganzen Origins) |

**Datenbank:** `kpAuth/secret {code}` und `kpAuth/uid` nur für das Gerätekonto lesbar,
`kpAuth/seen/<gerät>` = Telemetrie (wer ist noch anonym), `pub/kpDev/on` = Code existiert
(schaltet den gelben Balken ein).

**Regeln:** Root hat keine Regel mehr; `$top` gilt für alle Top-Level-Knoten **außer** den
benannten (`kpAuth`, `pub`, `v2`, `lagertest` — Firebase-Doku: „$other means any key excluding…").
- **Phase A** (`firebase-rules.json`): KP = anonym **oder** Gerätekonto. Für alle bisherigen
  Clients identisch zu vorher, nur `kpAuth` ist neu und nur fürs Gerätekonto.
- **Phase B** (`firebase-rules.phaseB.json`): KP = nur Gerätekonto. Partner-Regeln enger
  (pushQueue nur mit Member-Datensatz, members nur Passwort-Konten, config nur aktive).

**Reihenfolge:** Phase-A-Regeln → Clients deployen → im Management „สร้างรหัสอุปกรณ์ / create
the device code" (einmalig; sofort danach, damit niemand die E-Mail vorher registriert —
schlägt die Anlage mit *email-already-in-use* fehl, hat jemand sie vorweggenommen → E-Mail in
`kp-auth.js`/`sales.html` ändern) → Code an das Team (LINE, nur Staff-Gruppe) → jedes Gerät
einmal eingeben → Management-Liste „ยังไม่เปิดใช้งาน / not activated" leer → Phase-B-Regeln.

**Code wechseln** (Mitarbeiter geht, Code geleakt): Management → „เปลี่ยนรหัสอุปกรณ์". Alle
anderen Geräte verlieren innerhalb ~1 h die Sitzung und brauchen den neuen Code.
Rollback: `firebase-rules.json` der Phase A wieder deployen (Geräte und Anonyme haben dann Zugriff).
