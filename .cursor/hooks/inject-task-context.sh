#!/bin/bash
# Prepends a per-subagent-type preamble to the Task tool's prompt.
# Looks up .cursor/hooks/task-preambles/<subagent_type>.md.
# No-op when the tool is not Task, when subagent_type is missing, or when no
#   preamble file exists for that type.

set -u

input=$(cat)

tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
if [ "$tool_name" != "Task" ]; then
    echo '{}'
    exit 0
fi

subagent_type=$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // empty')
if [ -z "$subagent_type" ]; then
    echo '{}'
    exit 0
fi

preamble_file=".cursor/hooks/task-preambles/${subagent_type}.md"
if [ ! -f "$preamble_file" ]; then
    echo '{}'
    exit 0
fi

preamble=$(cat "$preamble_file")

printf '%s' "$input" | jq \
    --arg preamble "$preamble" \
    '{
        permission: "allow",
        updated_input: (.tool_input | .prompt = ($preamble + "\n\n---\n\n" + (.prompt // "")))
    }'
