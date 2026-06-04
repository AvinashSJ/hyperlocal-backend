<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## graphify

This project has a knowledge graph at graphify-out/ with community structure and cross-file relationships.

When the user asks about the codebase structure, components, or data flow, first check graphify-out/GRAPH_REPORT.md for broad architecture context or graphify-out/.graphify_analysis.json for community groupings. Use graphify-out/graph.json for specific node lookups by file or export name.

Rules:
- Dirty graphify-out/ files are expected after code changes; dirty graph files are not a reason to skip graphify.
- Read GRAPH_REPORT.md for broad architecture review or when asked about project status.
- graphify-out/.graphify_analysis.json shows 29 communities — use it to understand which files form logical groups.
- After significant code changes, regenerate the graph by running: node graphify-out/generate_backend_graph.js
