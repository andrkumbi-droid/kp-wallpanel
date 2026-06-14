# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KP Wallpanel is a **zero-build, monolithic single-page web application** for a Thailand-based logistics/distribution business. It integrates Firebase Realtime Database, Google Sheets, and LINE Bot API to manage orders, inventory, drivers, and staff.

There is no build step, no bundler, no transpiler, and no test suite. All application logic lives in `index.html` (≈8,600 lines). `warehouse-display.html` is a standalone real-time order board for the warehouse screen.

## Deployment

The app is served statically (GitHub Pages at `/kp-wallpanel/`). Deploy by pushing to `main` — no CI/CD pipeline exists. The service worker (`sw.js`) uses a **network-first strategy** for `index.html` so users always get the latest code when online. After significant changes, bump the cache name in `sw.js` (e.g. `kp-v2` → `kp-v3`) to force cache invalidation.

## Architecture

### Role-Based Screens

The app has four distinct user roles, each with its own login screen and set of views. All screens coexist in `index.html` and are toggled via CSS `display`.

| Role | Screen ID | Login | Accent Color |
|---|---|---|---|
| Manager | `s-manager` | PIN | Purple `#7c3aed` |
| Office | `s-office` | PIN | Green `#16a34a` |
| Warehouse | `s-warehouse` | None | Orange `#ea580c` |
| Driver | `s-driver` | PIN | Blue `#0284c7` |

**Naming conventions:**
- Screen containers: `s-{role}` and `s-{role}-login`
- View panels within a screen: `{role-prefix}v-{feature}` — e.g. `mgv-stock`, `ofv-orders`, `whv-packing`, `drv-tour`
- Role prefixes: `mg` (manager), `of` (office), `wh` (warehouse), `dr` (driver)
- Render functions follow the same prefix: `ofRenderOrders()`, `mgRenderStaff()`, etc.

### Firebase Data Model

All persistent data lives in Firebase Realtime Database under these top-level paths:

```
orders          — main order objects (status: new → packing → ready → loaded → delivered/cancelled)
wOrders         — warehouse-facing order subset
stockItems      — inventory
incomingItems   — container/stock arrivals
drivers         — driver list
activeTours     — in-progress delivery tours
revOrders       — revenue tracking
claims          — damage/claim records
containerLog    — incoming container history
auditLog        — last 200 actions
staffList       — employees
customerMeta    — customer metadata (block status, notes)
attStaff        — attendance records
lateLog         — late arrival log
shippers        — shipping providers
fcmTokens       — FCM tokens by role/userId
pushQueue       — offline notification queue
orderCounters   — next order number per zone
receiptNum      — receipt counter
photoIndex      — lightweight photo metadata (no image data)
recentlyDeleted — soft-deleted orders
soldOut         — sold-out product flags
```

### Firebase Helper Functions

All Firebase writes go through these window-scoped helpers (defined in `index.html`):

```javascript
fbSave(path, data)    // db.ref(path).set(data)
fbPush(path, data)    // db.ref(path).push(data)
fbUpdate(path, data)  // db.ref(path).update(data)
fbRemove(path)        // db.ref(path).remove()
fbDB                  // raw firebase.database() reference
```

### Real-time Listener Pattern

Every data collection is subscribed with `.on('value', ...)` at startup, mutations to global arrays, then a render call:

```javascript
db.ref('orders').on('value', function(snap) {
  orders = snap.val() ? Object.values(snap.val()) : [];
  try { ofRenderOrders(); } catch(e) {}
});
```

Global state is stored in plain arrays/objects at module scope — no state management library.

### Google Apps Script Backend (`apps-script/`)

`Code.gs` exposes a `doPost(e)` REST endpoint used by the app to sync orders to/from Google Sheets. Actions:
- `readMirror` — import from mirror sheet tabs
- `target: 'master'` — append new order rows
- `target: 'masterUpdate'` — edit existing rows
- `target: 'masterClear'` — delete rows

All calls must include the token `kp-7h3x9q2`. Columns G and K in the sheet contain formulas (amount/total) that the script preserves during updates.

`line-bot.gs` handles the LINE Bot webhook (`doPost`), routes queries (Revenue, Stock, Orders, etc.), and supports Thai/German language auto-detection.

### Service Worker

`sw.js` — app shell caching, network-first for app HTML, network-only for Firebase/CDN resources.  
`firebase-messaging-sw.js` — background FCM push notification handler.

## Key Conventions

- **Language:** The UI is primarily Thai. String literals, labels, and user-facing messages throughout `index.html` are in Thai.
- **Timezone:** All dates/times use `Asia/Bangkok`.
- **Order status flow:** `new` → `packing` → `ready` → `loaded` → `delivered` (or `cancelled` at any step).
- **DOM manipulation:** Direct `innerHTML` assignment and `getElementById` — no virtual DOM. Avoid introducing framework dependencies.
- **Event binding:** Mix of inline `onclick` attributes and `addEventListener`. Follow the pattern already used in the surrounding code.
- **No linting or formatting config** is present. Match the indentation and style of the surrounding code (2-space indent, single quotes in JS).
- **Photos:** Photo metadata is stored in `photoIndex` in Firebase; actual image files go to Firebase Storage. The `photoIndex` holds only lightweight metadata (no binary data).

## Firebase Config

The Firebase config is hardcoded in `index.html`, `sw.js`, and `firebase-messaging-sw.js`. Project ID: `kp-wallpanel`, region: `asia-southeast1`. The API key is intentionally public (Firebase security rules enforce access control server-side).
