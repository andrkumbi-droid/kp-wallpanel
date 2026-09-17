# ════════════════════════════════════════════════════════════════════════════
#  invest.html  →  https://coanal.web.app
# ----------------------------------------------------------------------------
#  Die Container-Investment-Seite liegt zusaetzlich auf Firebase Hosting, damit
#  sie eine Adresse ohne GitHub-Namen und ohne "kp-wallpanel" hat. Dort heisst
#  sie index.html, deshalb ist der Link nur coanal.web.app.
#
#  Quelle bleibt invest.html in diesem Repo. Nach jeder Aenderung also BEIDES:
#      git push            (fuer andrkumbi-droid.github.io/kp-wallpanel/invest.html)
#      .\deploy-coanal.ps1 (fuer coanal.web.app)
#  Sonst laeuft eine der beiden Adressen mit altem Code auf denselben Daten.
#
#  Das Staging-Verzeichnis wird jedes Mal neu gebaut und danach weggeworfen —
#  es soll keine zweite Kopie der Datei im Repo herumliegen, die auseinander-
#  laufen kann.
# ════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'invest.html'
if (-not (Test-Path $src)) { throw "invest.html nicht gefunden neben $PSScriptRoot" }

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("coanal-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'public') | Out-Null
Copy-Item $src (Join-Path $stage 'public\index.html')

@'
{
  "hosting": {
    "site": "coanal",
    "public": "public",
    "ignore": ["firebase.json", "**/.*"],
    "headers": [
      { "source": "**/*.html", "headers": [{ "key": "Cache-Control", "value": "no-cache, max-age=0" }] }
    ]
  }
}
'@ | Out-File -FilePath (Join-Path $stage 'firebase.json') -Encoding utf8

Push-Location $stage
try {
  firebase deploy --only hosting --project kp-wallpanel
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $stage
}
