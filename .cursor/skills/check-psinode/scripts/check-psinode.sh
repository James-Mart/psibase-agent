#!/usr/bin/env bash
set -euo pipefail

pid=$(pgrep -x psinode 2>/dev/null || true)

if [ -z "$pid" ]; then
    echo "psinode is NOT running"
    exit 1
fi

port=$(ss -tlnp 2>/dev/null | grep "pid=$pid" | grep -oP ':\K[0-9]+' | head -1)
echo "psinode is running (pid=$pid, listen=${port:-unknown})"
