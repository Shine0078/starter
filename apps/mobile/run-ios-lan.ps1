param(
  [int]$Port = 3000
)

$addresses = @(
  Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
    Where-Object {
      $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
      $_.InterfaceAlias -notmatch '(?i)tailscale|vpn|tunnel|loopback'
    } |
    Sort-Object InterfaceIndex |
    Select-Object -ExpandProperty IPAddress
)

if ($addresses.Count -eq 0) {
  throw 'No usable LAN IPv4 address was found. Connect this computer to the same Wi-Fi as the iPhone.'
}

Write-Host 'FINVERSE iOS same-Wi-Fi development origins:' -ForegroundColor Cyan
foreach ($address in $addresses) {
  $origin = "http://${address}:${Port}"
  Write-Host "  $origin"
  Write-Host "  flutter run --dart-define=API_BASE_URL=$origin"
}

Write-Host ''
Write-Host 'Start the API with: npm run dev --workspace @finverse/api' -ForegroundColor Yellow
Write-Host 'The API already listens on 0.0.0.0. Allow Node.js through the private Windows Firewall profile if the iPhone cannot open /healthz.'
Write-Host 'Use a public HTTPS origin for release builds; this LAN HTTP helper is development-only.' -ForegroundColor Yellow
