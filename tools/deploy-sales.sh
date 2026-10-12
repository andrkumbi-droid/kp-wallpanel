#!/usr/bin/env bash
# Publish sales.html to https://kp-sales.web.app (Firebase Hosting, project kp-wallpanel).
# GitHub Pages keeps serving sales.html too; this only refreshes the short address.
set -e
cd "$(dirname "$0")/.."
node tools/check-html.js sales.html fragebogen.html
cp sales.html sales-site/index.html
cp fragebogen.html sales-site/fragebogen.html
cp sales-sw.js sales-site/sales-sw.js
cp help.html sales-site/help.html
MSYS_NO_PATHCONV=1 firebase deploy --only hosting:kp-sales --project kp-wallpanel --non-interactive
