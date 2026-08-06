// Live compatibility smoke test: exercises the current published SDK surface
// against a real, running CloudCruise backend. Read-only calls only.
//
// Requires: CLOUDCRUISE_API_KEY, COMPAT_TEST_BASE_URL. Optional:
// CLOUDCRUISE_ENCRYPTION_KEY (a placeholder is used if unset, since no
// vault operations are exercised here).
import { CloudCruise } from "../dist/index.js"

const baseUrl = process.env.COMPAT_TEST_BASE_URL
const apiKey = process.env.CLOUDCRUISE_API_KEY
const encryptionKey = process.env.CLOUDCRUISE_ENCRYPTION_KEY ?? "0".repeat(64)

if (!baseUrl) {
  console.error("FAIL: COMPAT_TEST_BASE_URL is required")
  process.exit(1)
}
if (!apiKey) {
  console.error("FAIL: CLOUDCRUISE_API_KEY is required")
  process.exit(1)
}

const client = new CloudCruise({ apiKey, baseUrl, encryptionKey })

try {
  const workflows = await client.workflows.getAllWorkflows()
  console.log(`OK: workflows.getAllWorkflows() -> ${workflows.length} workflows`)
} catch (err) {
  console.error(`FAIL: workflows.getAllWorkflows() -> ${err.message}`)
  process.exit(1)
}
