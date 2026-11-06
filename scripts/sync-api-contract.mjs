// Refreshes test/contract/api-contract.json from the published CloudCruise
// API reference, keeping only the parts the SDK types mirror. Descriptions,
// titles and examples are dropped so wording edits in the docs do not count
// as contract changes.
//
//   node scripts/sync-api-contract.mjs          rewrite the snapshot
//   node scripts/sync-api-contract.mjs --check  exit 1 if the published API differs from the snapshot
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const SOURCE = "https://docs.cloudcruise.com/run-api/run-api.yaml";
const SNAPSHOT = fileURLToPath(new URL("../test/contract/api-contract.json", import.meta.url));
const RESPOND_PATH = "/run/{session_id}/decision/respond";

function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !["description", "title", "example", "summary"].includes(key))
        .map(([key, value]) => [key, strip(value)]),
    );
  }
  return node;
}

function extract(spec) {
  const schemas = spec.components.schemas;
  return {
    source: SOURCE,
    paths: Object.keys(spec.paths).sort(),
    webhooks: Object.keys(spec.webhooks ?? {}).sort(),
    subscribable_events: [...schemas.RunSpecificWebhook.properties.event_types_subscribed.items.enum].sort(),
    decision_requested: strip(schemas.AgentDecisionRequestedEvent),
    decision_answered: strip(schemas.AgentDecisionAnsweredEvent),
    decision_respond_request: strip(
      spec.paths[RESPOND_PATH].post.requestBody.content["application/json"].schema,
    ),
  };
}

const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`FAIL: GET ${SOURCE} -> ${response.status}`);
  process.exit(1);
}
const next = `${JSON.stringify(extract(parse(await response.text())), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(SNAPSHOT, "utf8");
  if (current !== next) {
    console.error(`FAIL: ${SOURCE} no longer matches test/contract/api-contract.json. Run node scripts/sync-api-contract.mjs, then fix the types until npm test passes.`);
    process.exit(1);
  }
  console.log("OK: the published API matches the SDK contract snapshot");
} else {
  await writeFile(SNAPSHOT, next);
  console.log(`Wrote ${SNAPSHOT}`);
}
