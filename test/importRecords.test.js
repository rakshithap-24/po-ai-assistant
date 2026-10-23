const assert = require("node:assert/strict");
const test = require("node:test");

const { prepareAwardRecords } = require("../srv/procurement/importRecords");

test("deduplicates awards and reuses vendors within a page", () => {
  const importedIDs = new Set(["EXISTING"]);
  const vendors = new Map();
  let nextID = 0;
  const result = prepareAwardRecords([
    { "Award ID": "EXISTING", "Award Amount": 10, "Recipient Name": "Acme" },
    { "Award ID": "NEW-1", "Award Amount": "$1,200", "Recipient Name": "Acme" },
    { "Award ID": "NEW-2", "Award Amount": 500, "Recipient Name": "Acme" },
    { "Award ID": "INVALID", "Award Amount": 0, "Recipient Name": "Other" }
  ], importedIDs, vendors, () => `id-${++nextID}`);

  assert.equal(result.duplicateSkippedCount, 1);
  assert.equal(result.invalidSkippedCount, 1);
  assert.equal(result.vendorsToInsert.length, 1);
  assert.equal(result.purchaseOrdersToInsert.length, 2);
  assert.equal(result.purchaseOrdersToInsert[0].vendor_ID, result.purchaseOrdersToInsert[1].vendor_ID);
  assert.equal(result.purchaseOrdersToInsert[0].riskLevel, "Unassessed");
});