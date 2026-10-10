#!/usr/bin/env bash
# Publish sales.html to https://kp-sales.web.app (Firebase Hosting, project kp-wallpanel).
# GitHub Pages keeps serving sales.html too; this only refreshes the short address.
set -e
cd "$(dirname "$0")/.."
cp sales.html sales-site/index.html
MSYS_NO_PATHCONV=1 firebase deploy --only hosting:kp-sales --project kp-wallpanel --non-interactive
