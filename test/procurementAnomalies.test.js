const assert = require("node:assert/strict");
const test = require("node:test");

const { findProcurementAnomalies } = require("../srv/procurement/anomalies");

test("detects budget overruns, restricted vendors, and exact duplicate orders", () => {
  const anomalies = findProcurementAnomalies(
    [
      { ID: "1", poNumber: "PO-1", vendor_ID: "v1", amount: 1200, budgetAmount: 1000, currency: "USD", description: "Equipment" },
      { ID: "2", poNumber: "PO-2", vendor_ID: "v2", amount: 500, currency: "USD", description: "Service" },
      { ID: "3", poNumber: "PO-3", vendor_ID: "v2", amount: 500, currency: "USD", description: " Service " }
    ],
    [
      { ID: "v1", name: "Vendor One" },
      { ID: "v2", name: "Vendor Two", restricted: true }
    ]
  );

  assert.deepEqual(anomalies.map((item) => item.anomalyType), [
    "Budget exceeded",
    "Restricted vendor",
    "Restricted vendor",
    "Possible duplicate"
  ]);
});

test("flags large orders that are outliers against vendor median", () => {
  const anomalies = findProcurementAnomalies(
    [1000, 1100, 1200, 30000].map((amount, index) => ({
      ID: String(index),
      poNumber: `PO-${index}`,
      vendor_ID: "v1",
      amount,
      currency: "USD",
      description: `Order ${index}`
    })),
    [{ ID: "v1", name: "Vendor One" }]
  );

  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].anomalyType, "Unusual vendor spend");
  assert.equal(anomalies[0].severity, "Medium");
});