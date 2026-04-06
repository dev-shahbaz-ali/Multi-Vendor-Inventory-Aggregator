/**
 * Race Condition Load Test
 * ========================
 * Fires 50 concurrent purchase requests against a product with exactly 5 units of stock.
 * Verifies that exactly 5 purchases succeed and 45 fail — stock must end at 0, never negative.
 *
 * Usage:
 *   node tests/load/race-condition.js <productId> [baseUrl]
 *
 * Example:
 *   node tests/load/race-condition.js 64abc123def456789 http://localhost:3000
 *
 * Before running:
 *   1. Make sure the server is running: npm run dev
 *   2. Set the product's stock to exactly 5:
 *      PUT /api/inventory/<productId>/stock  { "quantity": 5, "operation": "add" }
 *      (or reduce it first if stock is higher)
 */

const http = require("http");
const https = require("https");

const TOTAL_REQUESTS = 50;
const PURCHASE_QUANTITY = 1;
const EXPECTED_STOCK = 5; // stock before the test

const productId = process.argv[2];
const baseUrl = process.argv[3] || "http://localhost:3000";

if (!productId) {
  console.error("Usage: node tests/load/race-condition.js <productId> [baseUrl]");
  console.error("Example: node tests/load/race-condition.js 64abc123def456789");
  process.exit(1);
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

function request(method, url, body) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const options = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ status: 0, body: { error: err.message } });
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log("=".repeat(60));
  console.log("  RACE CONDITION LOAD TEST");
  console.log("=".repeat(60));
  console.log(`  Product ID  : ${productId}`);
  console.log(`  Base URL    : ${baseUrl}`);
  console.log(`  Requests    : ${TOTAL_REQUESTS}`);
  console.log(`  Qty each    : ${PURCHASE_QUANTITY}`);
  console.log(`  Expected OK : ${EXPECTED_STOCK} (set stock to ${EXPECTED_STOCK} before running)`);
  console.log("=".repeat(60));

  // Check server health
  const health = await request("GET", `${baseUrl}/health`);
  if (health.status !== 200) {
    console.error(`\n❌ Server not reachable at ${baseUrl}/health (status ${health.status})`);
    process.exit(1);
  }
  console.log(`\n✅ Server is up (MongoDB: ${health.body.mongodb})\n`);

  // Check current stock before the test
  const invRes = await request("GET", `${baseUrl}/api/inventory/product/${productId}`);
  if (invRes.status !== 200) {
    console.error(`❌ Could not fetch inventory for product ${productId}`);
    console.error(`   Response: ${JSON.stringify(invRes.body)}`);
    process.exit(1);
  }
  const stockBefore = invRes.body.data.stock;
  console.log(`📦 Stock before test : ${stockBefore}`);

  if (stockBefore !== EXPECTED_STOCK) {
    console.warn(`\n⚠️  WARNING: stock is ${stockBefore}, not ${EXPECTED_STOCK}.`);
    console.warn(`   The test expects exactly ${EXPECTED_STOCK} units so that`);
    console.warn(`   ${EXPECTED_STOCK} of ${TOTAL_REQUESTS} requests succeed.`);
    console.warn(`   Continuing anyway — adjust expectations accordingly.\n`);
  }

  // ── Fire all 50 requests concurrently ──────────────────────────────────────
  console.log(`\n🚀 Firing ${TOTAL_REQUESTS} concurrent purchase requests...\n`);
  const start = Date.now();

  const requests = Array.from({ length: TOTAL_REQUESTS }, (_, i) =>
    request("POST", `${baseUrl}/api/purchase`, {
      productId,
      quantity: PURCHASE_QUANTITY,
      userId: `load_test_user_${i + 1}`,
    })
  );

  const responses = await Promise.all(requests);
  const elapsed = Date.now() - start;

  // ── Tally results ──────────────────────────────────────────────────────────
  const succeeded = responses.filter((r) => r.status === 200);
  const failed = responses.filter((r) => r.status !== 200);
  const statusCounts = {};
  responses.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  // Check final stock
  const invAfter = await request("GET", `${baseUrl}/api/inventory/product/${productId}`);
  const stockAfter = invAfter.status === 200 ? invAfter.body.data.stock : "unknown";

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("─".repeat(60));
  console.log("  RESULTS");
  console.log("─".repeat(60));
  console.log(`  Time elapsed     : ${elapsed}ms`);
  console.log(`  Total sent       : ${TOTAL_REQUESTS}`);
  console.log(`  ✅ Succeeded (200): ${succeeded.length}`);
  console.log(`  ❌ Failed         : ${failed.length}`);
  console.log(`  Status breakdown : ${JSON.stringify(statusCounts)}`);
  console.log(`  Stock before     : ${stockBefore}`);
  console.log(`  Stock after      : ${stockAfter}`);
  console.log("─".repeat(60));

  // ── Assertions ─────────────────────────────────────────────────────────────
  console.log("\n  ASSERTIONS");
  console.log("─".repeat(60));

  const assert = (label, pass) => {
    console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}  ${label}`);
    return pass;
  };

  const results = [
    assert(
      `Succeeded == stock before test (${succeeded.length} == ${stockBefore})`,
      succeeded.length === stockBefore
    ),
    assert(
      `Failed == total - stock before (${failed.length} == ${TOTAL_REQUESTS - stockBefore})`,
      failed.length === TOTAL_REQUESTS - stockBefore
    ),
    assert(
      `Stock after == 0 (actual: ${stockAfter})`,
      stockAfter === 0
    ),
    assert(
      "Stock never went negative (atomic op guarantees this)",
      typeof stockAfter === "number" && stockAfter >= 0
    ),
    assert(
      `Failed responses returned 409 Conflict (count: ${statusCounts[409] || 0})`,
      (statusCounts[409] || 0) === TOTAL_REQUESTS - stockBefore
    ),
  ];

  console.log("─".repeat(60));
  const allPassed = results.every(Boolean);
  if (allPassed) {
    console.log("\n✅ ALL ASSERTIONS PASSED — race condition handling is correct.\n");
  } else {
    console.log("\n❌ SOME ASSERTIONS FAILED — review the output above.\n");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
