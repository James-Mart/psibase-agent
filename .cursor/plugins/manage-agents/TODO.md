# Future upgrades

1. Within the commit-review tab, it is currently split horizontally with 50% of the width going to a diff view, and 50% going to a graph view. I want the new default splt too be 70/30. (70% diff, 30% graph). But I want to be able to click & drag to dynamically update the left/right split. 
1. The diff should be enhanced in the following ways: The file tree part is fine, but should be collapsable. The actual diff part should be scrollable so I can continuously scroll down to view subsequent files in the diff. I want a "viewed" checkbox like github so I can mark files as already viewed. Also consider changing to diffs.com code diffing library, it looks really clean.
1. change-surveyor does not need to return `touchedAreas` or `ambiguousOrRiskyAreas`. Just summary + notable changes. Ensure any downstream effects of changing this schema are handled.
1. Need a rigorous review of all terminology used across all skills, agents, and code. I want to align on terminology. 
1. Do a run, review the timing of all the tool calls, and determine if there are any unexpected bottlenecks that could be responsible for causing the UI to feel sluggish. 

