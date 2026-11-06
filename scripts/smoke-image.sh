#!/usr/bin/env bash
# Runs the web image as the cluster will, with a read-only root filesystem and a tmpfs /tmp, on a random loopback port,
# and checks over HTTP what the static host contract in docs/DEPLOYMENT.md and deploy/nginx/default.conf promise: status
# codes, Content-Type, Cache-Control, gzip and security headers. It always removes its container, and exits non-zero if
# any check fails.
#
#   scripts/smoke-image.sh <image>
#
# The models it checks are every /assets/*.glb that src/ names (src/data/world-layout.json included) and every one that
# public/assets ships, and each must match this checkout's bytes, so run it from the commit the image was built from.
# images.yml runs it against the linux/amd64 image of a pull request, and against the exact digest it pushed from main.
# Needs bash (3.2 is enough), docker, curl and gzip.
set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "usage: $0 <image>" >&2
  exit 2
fi
image="$1"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="awushi-smoke-$$-$RANDOM"
failures=0

cleanup() { docker rm --force "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

pass() { printf 'PASS %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*"; failures=$((failures + 1)); }
check() { # check <label> <actual> <expected>
  if [[ "$2" == "$3" ]]; then pass "$1: $2"; else fail "$1: got '$2', expected '$3'"; fi
}
sha256() { if command -v sha256sum >/dev/null; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

user="$(docker image inspect --format '{{.Config.User}}' "$image")"
if [[ -n "$user" && "$user" != 0 && "$user" != root && "$user" != 0:* && "$user" != root:* ]]; then
  pass "image runs as user $user"
else
  fail "image runs as root (user '$user')"
fi

docker run --detach --name "$container" --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --publish 127.0.0.1::8080 "$image" >/dev/null
port="$(docker port "$container" 8080/tcp | head -n 1 | sed 's/.*://')"
base="http://127.0.0.1:$port"
printf '== %s on %s, read-only with a tmpfs /tmp\n' "$image" "$base"

ready=no
for _ in $(seq 1 30); do
  if [[ "$(curl --silent --output /dev/null --max-time 2 --write-out '%{http_code}' "$base/healthz" || true)" == 200 ]]; then
    ready=yes
    break
  fi
  sleep 1
done
if [[ "$ready" != yes ]]; then
  fail "/healthz did not answer 200 within 30 s"
  docker logs "$container" 2>&1 | tail -n 30
  exit 1
fi

headers=""
fetch() { # fetch <path> [curl args...]: GET the path, keep its response headers in $headers and its status in $status
  local path="$1"
  shift
  headers="$(curl --silent --show-error --max-time 30 --dump-header - --output /dev/null ${1+"$@"} "$base$path" | tr -d '\r')"
  status="$(printf '%s\n' "$headers" | sed -n '1s/^HTTP\/[0-9.]* \([0-9][0-9]*\).*/\1/p')"
}
header() { printf '%s\n' "$headers" | grep -i "^$1:" | head -n 1 | sed 's/^[^:]*: *//' || true; }

# expect <path> <status> <content type> <cache-control> [curl args...]
# The content type is compared without its "; charset=" part. A cache-control of "none" means the header must be absent.
expect() {
  local path="$1" want_status="$2" want_type="$3" want_cache="$4" server
  shift 4
  fetch "$path" ${1+"$@"}
  check "$path status" "$status" "$want_status"
  check "$path Content-Type" "$(header Content-Type | sed 's/;.*//')" "$want_type"
  if [[ "$want_cache" == none ]]; then
    check "$path Cache-Control" "$(header Cache-Control)" ""
  else
    check "$path Cache-Control" "$(header Cache-Control)" "$want_cache"
  fi
  check "$path X-Content-Type-Options" "$(header X-Content-Type-Options)" nosniff
  server="$(header Server)"
  if [[ "$server" =~ [0-9] ]]; then fail "$path Server names a version: $server"; fi
}

# expect_gzip <path> <sha256 of the identity bytes>: sent gzipped when asked, and the same bytes once decompressed
expect_gzip() {
  fetch "$1" --header 'Accept-Encoding: gzip'
  check "$1 gzip status" "$status" 200
  check "$1 Content-Encoding" "$(header Content-Encoding)" gzip
  check "$1 Vary" "$(header Vary)" Accept-Encoding
  check "$1 gzip body decompresses to the identity body" \
    "$(curl --silent --max-time 30 --header 'Accept-Encoding: gzip' "$base$1" | gzip -dc | sha256)" "$2"
}

no_cache="no-cache"
revalidate="public, max-age=0, must-revalidate"
immutable="public, max-age=31536000, immutable"

expect /healthz 200 text/plain "$no_cache"
check "/healthz body" "$(curl --silent --max-time 10 "$base/healthz")" ok

expect / 200 text/html "$no_cache"
check "/ Referrer-Policy" "$(header Referrer-Policy)" strict-origin-when-cross-origin
check "/ X-Frame-Options" "$(header X-Frame-Options)" SAMEORIGIN
check "/ Permissions-Policy" "$(header Permissions-Policy)" "camera=(), microphone=(), geolocation=(), payment=()"
check "/ Content-Security-Policy" "$(header Content-Security-Policy)" \
  "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'"
html="$(curl --silent --max-time 10 "$base/")"
expect /index.html 200 text/html "$no_cache"
expect_gzip /index.html "$(curl --silent --max-time 10 "$base/index.html" | sha256)"

# Vite's entry script and stylesheet, as index.html names them, and the chunks the entry script imports.
entry="$(printf '%s\n' "$html" | grep -oE 'src="/assets/index-[A-Za-z0-9_-]{8,}\.js"' | head -n 1 | sed 's/^src="//; s/"$//' || true)"
style="$(printf '%s\n' "$html" | grep -oE 'href="/assets/index-[A-Za-z0-9_-]{8,}\.css"' | head -n 1 | sed 's/^href="//; s/"$//' || true)"
if [[ -z "$entry" || -z "$style" ]]; then
  fail "index.html names no hashed entry script or stylesheet (script '$entry', stylesheet '$style')"
else
  expect "$entry" 200 application/javascript "$immutable"
  expect_gzip "$entry" "$(curl --silent --max-time 30 "$base$entry" | sha256)"
  expect "$style" 200 text/css "$immutable"
  chunks="$(curl --silent --max-time 30 "$base$entry" | grep -oE '"\./[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.js"' | sort -u || true)"
  if [[ -z "$chunks" ]]; then fail "$entry imports no hashed chunk, so the lazy scene bundle was not found"; fi
  for chunk in $chunks; do
    chunk="${chunk//\"/}"
    expect "/assets/${chunk#./}" 200 application/javascript "$immutable"
  done
fi
expect /assets/index-00000000.js 404 text/html none

# Every model the source names and every one public/assets ships, each byte for byte as this checkout has it.
models="$({
  grep -rhoE '/assets/[A-Za-z0-9._-]+\.glb' "$root/src" || true
  for file in "$root"/public/assets/*.glb; do
    if [[ -f "$file" ]]; then echo "/assets/${file##*/}"; fi
  done
} | sort -u)"
for required in /assets/awushi.glb /assets/island.glb; do
  if ! printf '%s\n' "$models" | grep -qxF "$required"; then fail "$required is not among the models to check"; fi
done
count=0
for model in $models; do
  count=$((count + 1))
  expect "$model" 200 model/gltf-binary "$revalidate"
  if [[ -f "$root/public$model" ]]; then
    check "$model bytes match public$model" "$(curl --silent --max-time 30 "$base$model" | sha256)" \
      "$(sha256 <"$root/public$model")"
  else
    fail "$model is named in src/ but public$model does not exist"
  fi
done
printf '== %s models checked\n' "$count"
expect_gzip /assets/awushi.glb "$(sha256 <"$root/public/assets/awushi.glb")"

branding="$(cd "$root/public" && find assets/branding -type f -name '*.png' | sort | head -n 1)"
if [[ -n "$branding" ]]; then expect "/$branding" 200 image/png "$no_cache"; fi

# No fallback to index.html anywhere, and no directory listings.
expect /assets/missing.glb 404 text/html "$revalidate"
expect /does-not-exist 404 text/html "$no_cache"
expect /assets/ 404 text/html "$no_cache"
expect /assets 404 text/html "$no_cache"

if [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]]; then
  pass "container still running on a read-only root filesystem"
else
  fail "container stopped"
fi
problems="$(docker logs "$container" 2>&1 | grep -E '\[(warn|error|crit|alert|emerg)\]' || true)"
if [[ -z "$problems" ]]; then
  pass "nginx logged no warning or error"
else
  fail "nginx logged:"
  printf '%s\n' "$problems"
fi

if [[ "$failures" -ne 0 ]]; then
  printf '== %s check(s) failed for %s\n' "$failures" "$image"
  exit 1
fi
printf '== all checks passed for %s\n' "$image"
