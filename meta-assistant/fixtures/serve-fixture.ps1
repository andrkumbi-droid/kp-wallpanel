# Static server for offline fixture dev (serves the whole kp-wallpanel repo).
# Same pattern as ../../serve.ps1, own port so it never collides with it.
$port = 8471
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = $req.Url.LocalPath -replace '/', '\'
    if ($path -eq '\') {
        # redirect instead of serving at '/' — the fixture uses relative ../extension paths
        $res.StatusCode = 302
        $res.RedirectLocation = '/meta-assistant/fixtures/inbox-snapshot.html'
        $res.OutputStream.Close()
        continue
    }
    $file = Join-Path $root $path.TrimStart('\')
    if (Test-Path $file -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($file)
        $mime = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.json' { 'application/json' }
            '.png'  { 'image/png' }
            '.jpg'  { 'image/jpeg' }
            '.svg'  { 'image/svg+xml' }
            default { 'application/octet-stream' }
        }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $res.ContentType = $mime
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
    }
    $res.OutputStream.Close()
}
