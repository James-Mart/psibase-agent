#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 <service> <query> [--user <account>] [--port <port>]"
    exit 1
}

SERVICE=""
QUERY=""
USER=""
PORT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user)  USER="$2";  shift 2 ;;
        --port)  PORT="$2";  shift 2 ;;
        -*)      usage ;;
        *)
            if [ -z "$SERVICE" ]; then SERVICE="$1"
            elif [ -z "$QUERY" ]; then QUERY="$1"
            else usage
            fi
            shift ;;
    esac
done

[ -z "$SERVICE" ] || [ -z "$QUERY" ] && usage

# Auto-detect port from running psinode if not specified
if [ -z "$PORT" ]; then
    PORT=$(ps -eo args= | grep '[p]sinode' | grep -oP '(?<=-l\s)\d+' || true)
    PORT=${PORT:-8080}
fi

URL="http://${SERVICE}.psibase.localhost:${PORT}/graphql"
PSIBASE="${PSIBASE:-/root/psibase/build/rust/release/psibase}"

CURL_ARGS=(-s -X POST "$URL" -H "Content-Type: application/graphql" -d "$QUERY")

if [ -n "$USER" ]; then
    TOKEN=$("$PSIBASE" login "$USER" -a "http://psibase.localhost:${PORT}/" | sed 's/^bearer //')
    CURL_ARGS+=(-H "Authorization: Bearer $TOKEN")
fi

curl "${CURL_ARGS[@]}" | python3 -m json.tool
