const fs = require("fs");
const path = require("path");

const root = "E:\\insiconnect\\hyperlocal-backend\\src";

function walk(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).replace(/\\/g, "/");
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && e.name !== "node_modules") {
        result.push(...walk(full));
      }
    } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      const content = fs.readFileSync(full, "utf-8");
      const lines = content.split("\n");
      const labels = [];
      const usesClient = content.includes("'use client'");
      const isServerAction = content.includes('"use server"');

      for (const m of content.matchAll(/export (?:async )?function (\w+)/g)) labels.push(m[1]);
      for (const m of content.matchAll(/export default (?:function )?(\w+)/g)) labels.push(m[1]);
      for (const m of content.matchAll(/(?:interface|type) (\w+) /g)) labels.push(m[1]);

      result.push({ path: rel, lines: lines.length, labels: labels.slice(0, 6), usesClient, isServerAction });
    }
  }
  return result;
}

const files = walk(root);
files.sort((a, b) => a.path.localeCompare(b.path));

const nodes = [];
const nodeIds = new Set();
let community = 0;

// Group by directory for community assignments
const dirCommunity = {};
for (const f of files) {
  const parts = f.path.split("/");
  const dirKey = parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
  if (!dirCommunity[dirKey]) dirCommunity[dirKey] = community++;
  const cid = dirCommunity[dirKey];

  const safeId = "src_" + f.path.replace(/[\\/.\-]/g, "_").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const fname = f.path.split("/").pop();

  if (!nodeIds.has(safeId)) {
    nodes.push({
      id: safeId,
      label: fname,
      file_type: f.isServerAction ? "server_action" : f.usesClient ? "client_component" : "server_component",
      source_file: f.path,
      source_location: "L1",
      community: cid,
      norm_label: f.labels[0] || fname.replace(/\.\w+$/, ""),
    });
    nodeIds.add(safeId);
  }

  for (const label of f.labels) {
    const lid = safeId + "_" + label.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!nodeIds.has(lid)) {
      nodes.push({
        id: lid,
        label: label,
        file_type: "export",
        source_file: f.path,
        source_location: "L0",
        community: cid,
        norm_label: label,
      });
      nodeIds.add(lid);
    }
  }
}

fs.writeFileSync(
  "E:\\insiconnect\\hyperlocal-backend\\graphify-out\\graph.json",
  JSON.stringify({ directed: false, multigraph: false, graph: {}, nodes, edges: [] }, null, 2)
);

// Write analysis
const communities = {};
for (const n of nodes) {
  if (!communities[n.community]) communities[n.community] = [];
  communities[n.community].push(n.norm_label);
}

const analysis = { communities: {} };
for (const [cid, labels] of Object.entries(communities)) {
  analysis.communities[cid] = [...new Set(labels)];
}

fs.writeFileSync(
  "E:\\insiconnect\\hyperlocal-backend\\graphify-out\\.graphify_analysis.json",
  JSON.stringify(analysis, null, 2)
);

fs.writeFileSync(
  "E:\\insiconnect\\hyperlocal-backend\\graphify-out\\manifest.json",
  JSON.stringify(
    Object.fromEntries(
      files.map((f) => [
        "E:\\insiconnect\\hyperlocal-backend\\src\\" + f.path,
        { mtime: Date.now() / 1000, ast_hash: "generated", semantic_hash: "generated" },
      ])
    ),
    null,
    2
  )
);

console.log("Done. Nodes:", nodes.length, "Files:", files.length, "Communities:", Object.keys(communities).length);
