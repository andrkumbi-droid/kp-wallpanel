# KP Sortiment senden — Selbstbedienungs-Update fuer die Buero-Rechner.
#
# Holt die Dateien der Erweiterung direkt aus dem Repo (raw.githubusercontent)
# und legt sie in den Ordner, aus dem Chrome sie WIRKLICH laedt. Kein ZIP, kein
# Anhang, keine Nachfrage: Doppelklick auf KP-Update.bat, danach F5 im Posteingang.
#
# Den Ordner raet das Skript nicht: es liest Chromes eigene Aufzeichnung
# ("Secure Preferences" jedes Profils) und nimmt den Pfad der entpackten
# Erweiterung mit diesem Namen. Nur wenn dort nichts steht, faellt es auf
# C:\KP\extension zurueck (der Ordner aus der Anleitung).
param([string]$Dest = '')

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Base    = 'https://raw.githubusercontent.com/andrkumbi-droid/kp-wallpanel/main/meta-assistant/extension/'
$ExtName = 'KP Sortiment senden'
$Files   = @(
  'manifest.json',
  'background/sw.js',
  'content/selectors.js',
  'content/main-hook.js',
  'content/catalog-send.js',
  'content/overlay.js',
  'content/overlay.css'
)

function Find-ExtensionFolder {
  $roots = @("$env:LOCALAPPDATA\Google\Chrome\User Data", "$env:LOCALAPPDATA\Microsoft\Edge\User Data")
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    foreach ($prefs in Get-ChildItem $root -Filter 'Secure Preferences' -Recurse -Depth 1 -ErrorAction SilentlyContinue) {
      try { $j = Get-Content $prefs.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
      $set = $j.extensions.settings
      if (-not $set) { continue }
      foreach ($p in $set.PSObject.Properties) {
        $e = $p.Value
        if (-not $e.path -or $e.path -notmatch '^[A-Za-z]:') { continue }   # eingepackte Erweiterungen: nur eine Id, kein Pfad
        # Der Name steht in Chromes Aufzeichnung nicht zuverlaessig drin (bei
        # entpackten Erweiterungen fehlt die Manifest-Kopie oft ganz), also im
        # Ordner selbst nachsehen.
        $mf = Join-Path $e.path 'manifest.json'
        if (-not (Test-Path $mf)) { continue }
        try { $n = (Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).name } catch { continue }
        if ($n -eq $ExtName) { return $e.path }
      }
    }
  }
  return ''
}

Write-Host ''
Write-Host '  KP Sortiment senden — Update' -ForegroundColor Cyan
Write-Host ''

if (-not $Dest) { $Dest = Find-ExtensionFolder }
if (-not $Dest) { $Dest = 'C:\KP\extension' }

$old = ''
$mf  = Join-Path $Dest 'manifest.json'
if (Test-Path $mf) { try { $old = (Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch {} }

Write-Host ("  Ordner / โฟลเดอร์: " + $Dest)
if ($old) { Write-Host ("  bisher / เดิม:     v" + $old) }
Write-Host ''

# Erst ALLES herunterladen, dann schreiben. Bricht die Leitung mittendrin ab,
# bleibt die alte, lauffaehige Fassung stehen statt einer halben.
$tmp = Join-Path $env:TEMP ('kp-ext-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  foreach ($f in $Files) {
    $url = $Base + $f + '?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $out = Join-Path $tmp ($f -replace '/', '\')
    New-Item -ItemType Directory -Path (Split-Path $out -Parent) -Force | Out-Null
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -Headers @{ 'Cache-Control' = 'no-cache' }
    if ((Get-Item $out).Length -lt 100) { throw ("Datei zu klein / ไฟล์ไม่ครบ: " + $f) }
    Write-Host ('  ok  ' + $f) -ForegroundColor DarkGray
  }

  New-Item -ItemType Directory -Path $Dest -Force | Out-Null
  foreach ($f in $Files) {
    $src = Join-Path $tmp ($f -replace '/', '\')
    $dst = Join-Path $Dest ($f -replace '/', '\')
    New-Item -ItemType Directory -Path (Split-Path $dst -Parent) -Force | Out-Null
    Copy-Item $src $dst -Force
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

$new = ''
try { $new = (Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch {}

Write-Host ''
Write-Host ('  fertig / เสร็จแล้ว:  v' + $new) -ForegroundColor Green
Write-Host ''
Write-Host '  >> Jetzt business.facebook.com oeffnen und F5 druecken.' -ForegroundColor Yellow
Write-Host '  >> เปิด business.facebook.com แล้วกด F5' -ForegroundColor Yellow
Write-Host ''
if (-not $old) {
  Write-Host '  Die Erweiterung war hier noch nie geladen. Einmalig:' -ForegroundColor Yellow
  Write-Host '  chrome://extensions  ->  Entwicklermodus  ->  "Entpackte Erweiterung laden"  ->  ' -NoNewline
  Write-Host $Dest
  Write-Host ''
}
