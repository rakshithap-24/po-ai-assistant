"use strict";

function prepareAwardRecords(awards, importedAwardIDs, vendorsByName, makeID) {
  const vendorsToInsert = [];
  const purchaseOrdersToInsert = [];
  let duplicateSkippedCount = 0;
  let invalidSkippedCount = 0;

  for (const award of awards) {
    const externalAwardId = String(
      award["Award ID"] || award.award_id || award.generated_unique_award_id || ""
    ).trim();
    const amount = Number(String(award["Award Amount"] ?? award.award_amount ?? award.Amount ?? 0).replace(/[$,]/g, ""));

    if (!externalAwardId || !Number.isFinite(amount) || amount <= 0) {
      invalidSkippedCount += 1;
      continue;
    }
    if (importedAwardIDs.has(externalAwardId)) {
      duplicateSkippedCount += 1;
      continue;
    }
    importedAwardIDs.add(externalAwardId);

    const vendorName = String(award["Recipient Name"] || award.recipient_name || "Unknown Vendor").trim().slice(0, 100);
    let vendor = vendorsByName.get(vendorName);
    if (!vendor) {
      vendor = { ID: makeID(), name: vendorName, country: "USA", rating: 4 };
      vendorsByName.set(vendorName, vendor);
      vendorsToInsert.push(vendor);
    }

    const description = String(award.Description || award.description || `Live procurement award imported from USAspending for ${vendorName}`).trim().slice(0, 500);
    const shortAwardId = externalAwardId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
    const now = new Date();
    purchaseOrdersToInsert.push({
      ID: makeID(),
      poNumber: `PO-${shortAwardId}`,
      description,
      amount,
      currency: "USD",
      status: "Pending",
      externalAwardId,
      externalSource: "USAspending.gov API",
      importedAt: now,
      riskSummary: "Pending AI risk analysis.",
      aiRecommendation: "Pending",
      aiReason: "Live procurement data imported. AI insight has not been generated yet.",
      riskLevel: "Unassessed",
      aiGeneratedAt: null,
      approvedBy: null,
      approvedAt: null,
      vendor_ID: vendor.ID,
      createdAt: now,
      createdBy: "live.bulk.import",
      modifiedAt: now,
      modifiedBy: "live.bulk.import"
    });
  }

  return { vendorsToInsert, purchaseOrdersToInsert, duplicateSkippedCount, invalidSkippedCount };
}

module.exports = { prepareAwardRecords };