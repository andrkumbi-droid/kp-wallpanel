# KP Wallpanel — Operations / Apps Script

Quick reference for the Google Sheets ↔ app integration. **These `.gs` files do NOT deploy via GitHub Pages** — you must paste them into the relevant Google Sheet's Apps Script editor (Extensions → Apps Script → Save).

## Files

| File | Lives in | Does |
|------|----------|------|
| `Code.gs` | **Master** sheet | Receives app → sheet sync (`doPost`). Writes order rows + columns. |
| `master-onedit.gs` | **Master** sheet | Auto-splits the combined customer column on manual edits; hosts the **KP Tools** menu. |
| `auto-extend.gs` | **Master** sheet | Keeps a buffer of pre-formatted blank rows so the sheet never "runs out" at the bottom. |
| `extract-columns.gs` | Master sheet | One-time manual splitter (older, stricter; skips dash-format phones). Superseded by the KP Tools menu. |
| `line-bot.gs` | LINE bot project | LINE webhook + AI customer-parse. **Holds the secret keys.** |
| `meta-assistant.gs` | **Own** project | Backend for the Meta Business Suite Chrome extension (`meta-assistant/`): translate + Thai reply suggestions + style learning. **Own Anthropic key + `SHARED_TOKEN`.** Deploy as Web app, paste `/exec` URL into the extension options. See `meta-assistant/docs/CONCEPT.md`. |
| `resolve-link.gs` | **Own** project (any) | Web app that turns a `maps.app.goo.gl` short link → `{lat,lng}` for route sorting. Deploy as Web app (Execute as Me, Anyone), paste `/exec` URL into `index.html` `KP_RESOLVER_URL`. No keys. |

> **Secrets:** `LINE_TOKEN`, `ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` live **only** inside Apps Script — never in this repo or client code.

## Master sheet — column map (1-based)

`B(2)`=order no · `C(3)`=date · `D–F`=code/qty/price · `H`=clips · `I`=shipping · `J`=discount · `K`=grand total · `P(16)`=delivery round · `Q(17)`=contact channel · `R(18)`=**combined raw blob** (ชื่อ-ที่อยู่ลูกค้า) · `S(19)`=**name** · `T(20)`=**phone** · `U(21)`=**address** · `V(22)`=maps · `W(23)`=shipping bill · `X(24)`=pack status · `Y(25)`=shipper · `Z(26)`=notes.

The app already fills S/T/U/V for **app-created** orders (see `sheetsRowFor` in `index.html`). Mirror-imported / LINE-bot rows are **not** written back by the app.

## Customer splitting (R → S/T/U/V)

- **Automatic** (`master-onedit.gs`): runs only on **manual** typing into column R. Google `onEdit` does **not** fire for app-sync / bot / API writes — those rows stay unsplit.
- **Catch-up:** **KP Tools → "Split all customer rows"** (`splitAllRows`) — splits every still-empty name/phone/address cell using the tolerant parser (handles dash phones like `092-109-0111`). Never overwrites existing values.

## Row auto-extend (sheet filling up)

`auto-extend.gs` keeps **≥ `AE_MIN_BUFFER` (20)** empty *formatted* rows below the last data row. When the buffer runs low it appends **`AE_ROWS_TO_ADD` (50)** rows and copies format + dropdowns + row-relative formulas from a template row (`AE_TEMPLATE_ROW`, `0` = last data row). It runs from `master-onedit.gs`'s `onEdit` and returns instantly when the buffer is fine.

- **Manual trigger:** **KP Tools → "Add formatted rows now"** (`autoExtendAllNow`).
- **To change behaviour:** edit the three knobs at the top of `auto-extend.gs` (`AE_ROWS_TO_ADD`, `AE_MIN_BUFFER`, `AE_TEMPLATE_ROW`).

> ⚠️ First time: run **"Add formatted rows now"** once, and verify on a **backup copy** of the sheet that formatting + formulas land correctly. If a specific clean row should be the template, set `AE_TEMPLATE_ROW` to that row number.

## "Where do I change…?" (for fast edits)

- Column mapping app→sheet → `index.html` `sheetsRowFor()` **and** `Code.gs` (lines writing cols 16–26).
- Split parser logic → `kpParseCustomer()` (same code in `index.html` and `master-onedit.gs`).
- Row-extend amount/buffer/template → top of `auto-extend.gs`.
- The sheet menu items → `onOpen()` in `master-onedit.gs`.
