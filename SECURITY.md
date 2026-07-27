# KP Wallpanel — Firebase security

Bis 2026-07-27 stand die Realtime Database komplett offen (`".read": true, ".write": true`).
Google hat das per Mail gemeldet: *„Jeder Nutzer kann Ihre gesamte Datenbank lesen / darin schreiben."*
Die `databaseURL` steht im Klartext in der öffentlich gehosteten `index.html` — es reichte
also der Aufruf einer URL, um Orders, Kunden, Payroll und Staff-PINs zu lesen oder zu löschen.

## Stufe 1 (dieser Commit): Zugriff nur noch mit Auth

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

## Nächste Stufen

- **Stufe 1b — App Check** (reCAPTCHA v3, RTDB erzwingen): Tokens nur noch aus der echten
  App auf der echten Domain. Das schließt die Lücke oben und ist der grösste Sicherheits-
  gewinn pro Aufwand. Debug-Token für `serve.ps1`/localhost nicht vergessen.
- **Stufe 1c — Storage-Regeln**: Der Bucket (`storageBucket`) dürfte genauso offen sein.
  `allow read, write: if request.auth != null;` — geteilte Download-URLs mit Token
  funktionieren weiterhin, die sind Token-basiert und regelunabhängig.
- **Stufe 2 — Pfad-Regeln**: `staffList`/`payroll`/`bills` nur für Management, Audit-Log
  append-only (kein Überschreiben/Löschen).
- **Stufe 3 — echte Nutzer-Auth**: pro Mitarbeiter ein Firebase-Login (Custom Token aus
  Apps Script, Rolle als Claim). Erst damit ist die Rollentrennung serverseitig echt —
  heute ist der PIN-Login reine UI.
