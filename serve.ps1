$port = 8123
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$port/"
while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
    } catch {
        continue
    }
    $req = $ctx.Request
    $res = $ctx.Response
    try {
        $path = $req.Url.LocalPath -replace '/', '\'
        if ($path -eq '\') { $path = '\index.html' }
        $file = Join-Path $root $path.TrimStart('\')
        if (Test-Path $file -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($file)
            $mime = switch ($ext) {
                '.html' { 'text/html; charset=utf-8' }
                '.css'  { 'text/css' }
                '.js'   { 'application/javascript' }
                '.json' { 'application/json' }
                '.svg'  { 'image/svg+xml' }
                '.png'  { 'image/png' }
                '.jpg'  { 'image/jpeg' }
                '.jpeg' { 'image/jpeg' }
                default { 'application/octet-stream' }
            }
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $res.ContentType = $mime
            # gzip compressible text assets when the client supports it
            $compressible = @('.html', '.css', '.js', '.json', '.svg') -contains $ext
            $acceptEnc = $req.Headers['Accept-Encoding']
            if ($req.HttpMethod -ne 'HEAD' -and $compressible -and $acceptEnc -and $acceptEnc.Contains('gzip')) {
                $ms = [System.IO.MemoryStream]::new()
                $gz = [System.IO.Compression.GZipStream]::new($ms, [System.IO.Compression.CompressionMode]::Compress)
                $gz.Write($bytes, 0, $bytes.Length)
                $gz.Close()
                $bytes = $ms.ToArray()
                $res.AddHeader('Content-Encoding', 'gzip')
            }
            $res.ContentLength64 = $bytes.Length
            if ($req.HttpMethod -ne 'HEAD') {
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } else {
            $res.StatusCode = 404
        }
    } catch {
        Write-Host "Request error: $($_.Exception.Message)"
    } finally {
        try { $res.OutputStream.Close() } catch {}
    }
}
