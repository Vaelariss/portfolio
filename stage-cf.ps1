# Stage the publishable site for Cloudflare Pages.
#
# `wrangler pages deploy` uploads whatever directory it is given, and the repo
# root carries things that must never be published: node_modules, the git
# history, Netlify CLI state, the function sources and the test fixtures.
# Netlify solved this with `publish = "."` plus its own ignore rules; Cloudflare
# has no equivalent, so the safe publish set is built explicitly here.
#
# Deliberately an allowlist, not a denylist. A new secret dropped in the repo
# root should fail to publish rather than publish by default.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root ".cfdist"

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force $dist | Out-Null

# Directories that are part of the site
foreach ($d in @("demo", "fonts", "img")) {
  if (Test-Path (Join-Path $root $d)) {
    Copy-Item (Join-Path $root $d) -Destination $dist -Recurse -Force
  }
}

# Root files that are part of the site. studio.html is excluded on purpose:
# it is the internal inbox UI and has no business being on a public origin.
$files = @(
  "_headers", "_redirects", "robots.txt", "sitemap.xml", "llms.txt", "assistant-kb.txt",
  "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "og-cover.png",
  "styles.css", "assistant.css", "script.js", "assistant.js", "partners.js",
  "index.html", "404.html", "thanks.html", "hi.html", "partners.html",
  "privacy.html", "terms.html", "refunds.html", "cancel.html",
  "ai-receptionist.html", "local-business-websites.html",
  "shopify-store-design.html", "custom-built-systems.html"
)
foreach ($f in $files) {
  $src = Join-Path $root $f
  if (Test-Path $src) { Copy-Item $src -Destination $dist -Force }
  else { Write-Warning "missing, not staged: $f" }
}

# Guard: nothing that could carry a secret or a private surface may ship.
$banned = @("node_modules", ".git", ".netlify", "netlify", "tests", "studio.html", "studio.js", "package.json", "package-lock.json", "netlify.toml", "README.md", "stage-cf.ps1")
foreach ($b in $banned) {
  if (Test-Path (Join-Path $dist $b)) { throw "REFUSING TO PUBLISH: $b was staged" }
}

$count = (Get-ChildItem $dist -Recurse -File).Count
$kb = [math]::Round(((Get-ChildItem $dist -Recurse -File | Measure-Object Length -Sum).Sum / 1KB))
Write-Host "staged $count files, $kb KB -> $dist"
