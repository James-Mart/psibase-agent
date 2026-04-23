#!/bin/bash
# Generalized tool-input preamble injector for preToolUse hooks.
#
# Per-tool configuration:
#   Task        -> field=prompt, sub_key=subagent_type, position=prepend
#                  preamble: .cursor/hooks/tool-preambles/Task/<subagent_type>.md
#   CreatePlan  -> field=plan,   sub_key=(none),        position=append
#                  preamble: .cursor/hooks/tool-preambles/CreatePlan.md
#
# No-op (echo {}) when the tool is unknown, no preamble file exists, or any
#   required field is missing. Failures fail-open by default.

set -u

input=$(cat)

tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')

case "$tool_name" in
    Task)
        field="prompt"
        sub_key=$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // empty')
        position="prepend"
        ;;
    CreatePlan)
        field="plan"
        sub_key=""
        position="append"
        ;;
    *)
        echo '{}'
        exit 0
        ;;
esac

if [ -n "$sub_key" ]; then
    preamble_file=".cursor/hooks/tool-preambles/${tool_name}/${sub_key}.md"
else
    preamble_file=".cursor/hooks/tool-preambles/${tool_name}.md"
fi

if [ ! -f "$preamble_file" ]; then
    echo '{}'
    exit 0
fi

preamble=$(cat "$preamble_file")
sep=$'\n\n---\n\n'

if [ "$position" = "prepend" ]; then
    jq_expr='{
        permission: "allow",
        updated_input: (.tool_input | .[$f] = ($p + $sep + (.[$f] // "")))
    }'
else
    jq_expr='{
        permission: "allow",
        updated_input: (.tool_input | .[$f] = ((.[$f] // "") + $sep + $p))
    }'
fi

printf '%s' "$input" | jq \
    --arg p "$preamble" \
    --arg f "$field" \
    --arg sep "$sep" \
    "$jq_expr"
