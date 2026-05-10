require("dotenv").config();

const cds = require("@sap/cds");
const { generatePurchaseOrderInsight } = require("./ai/llmProxy");
const { fetchLiveProcurementAwards } = require("./external/usaspendingService");

/**
 * Safely read values from the USAspending response.
 */
function getAwardValue(award, ...keys) {
  for (const key of keys) {
    if (award[key] !== undefined && award[key] !== null && award[key] !== "") {
      return award[key];
    }
  }
  return null;
}

/**
 * Convert any value into safe text with max length.
 */
function toSafeText(value, fallback, maxLength) {
  const text = value ? String(value).trim() : fallback;
  return text.substring(0, maxLength);
}

/**
 * Convert award amount into a number.
 */
function toAmount(value) {
  if (value === undefined || value === null) {
    return 0;
  }

  const cleanedValue = String(value).replace(/[$,]/g, "");
  const amount = Number(cleanedValue);

  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Build a PO number from external award id.
 */
function buildPONumber(externalAwardId) {
  const shortAwardId = String(externalAwardId)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);

  return `PO-${shortAwardId}`;
}

module.exports = cds.service.impl(async function () {
  const { PurchaseOrder, Vendor, LiveImportState } = this.entities;

  /**
   * Set default values and validate Purchase Order before creation.
   */
  this.before("CREATE", "PurchaseOrder", async (req) => {
    if (!req.data.status) {
      req.data.status = "Draft";
    }

    if (req.data.amount <= 0) {
      return req.error(400, "Amount must be greater than 0");
    }
  });

  /**
   * Import live procurement-like data from USAspending API.
   *
   * Improved flow:
   * 1. Read last imported USAspending page from HANA.
   * 2. If page is not passed, automatically import the next page.
   * 3. Fetch live award/procurement records.
   * 4. Create Vendor if not already available.
   * 5. Create PurchaseOrder in SAP HANA Cloud.
   * 6. Skip duplicate records using externalAwardId.
   * 7. Update LiveImportState in HANA.
   */
  this.on("importLiveProcurementData", async (req) => {
  console.log("Import Live Procurement Data action triggered");

  const tx = cds.tx(req);
  const IMPORT_STATE_ID = "USA_SPENDING_PO_IMPORT";

  try {
    const requestedLimit = Number(req.data?.limit || 50);
    const targetInsertCount = Math.min(requestedLimit, 100);

    let importState = await tx.run(
      SELECT.one.from(LiveImportState).where({ ID: IMPORT_STATE_ID })
    );

    let currentPage = importState?.lastPage
      ? Number(importState.lastPage) + 1
      : 1;

    const startPage = currentPage;

    let insertedCount = 0;
    let duplicateSkippedCount = 0;
    let invalidSkippedCount = 0;
    let lastProcessedPage = currentPage - 1;

    // Safety: scan up to 10 API pages per click to find 50 new records.
    const maxPagesToScan = 10;
    let pagesScanned = 0;

    while (insertedCount < targetInsertCount && pagesScanned < maxPagesToScan) {
      console.log(
        `Fetching USAspending page ${currentPage}, target new records: ${targetInsertCount}`
      );

      const liveAwards = await fetchLiveProcurementAwards(
        targetInsertCount,
        currentPage
      );

      if (!liveAwards || !liveAwards.length) {
        console.log(`No records returned from USAspending page ${currentPage}`);
        break;
      }

      for (const award of liveAwards) {
        const rawAwardId = getAwardValue(
          award,
          "Award ID",
          "award_id",
          "generated_unique_award_id",
          "Award Id"
        );

        const externalAwardId = toSafeText(rawAwardId, "", 120);

        const vendorName = toSafeText(
          getAwardValue(
            award,
            "Recipient Name",
            "recipient_name",
            "Recipient"
          ),
          "Unknown Vendor",
          100
        );

        const description = toSafeText(
          getAwardValue(
            award,
            "Description",
            "description",
            "Award Description"
          ),
          `Live procurement award imported from USAspending for ${vendorName}`,
          500
        );

        const amount = toAmount(
          getAwardValue(
            award,
            "Award Amount",
            "award_amount",
            "Amount"
          )
        );

        if (!externalAwardId || amount <= 0) {
          invalidSkippedCount++;
          continue;
        }

        const existingPO = await tx.run(
          SELECT.one.from(PurchaseOrder).where({ externalAwardId })
        );

        if (existingPO) {
          duplicateSkippedCount++;
          continue;
        }

        let vendor = await tx.run(
          SELECT.one.from(Vendor).where({ name: vendorName })
        );

        if (!vendor) {
          vendor = {
            ID: cds.utils.uuid(),
            name: vendorName,
            country: "USA",
            rating: 4
          };

          await tx.run(INSERT.into(Vendor).entries(vendor));
        }

        const po = {
          ID: cds.utils.uuid(),
          poNumber: buildPONumber(externalAwardId),
          description,
          amount,
          currency: "USD",
          status: "Pending",

          externalAwardId,
          externalSource: "USAspending.gov API",
          importedAt: new Date(),

          riskSummary: "Pending AI risk analysis.",
          aiRecommendation: "Pending",
          aiReason:
            "Live procurement data imported. AI insight has not been generated yet.",
          riskLevel:
            amount >= 50000 ? "High" : amount >= 15000 ? "Medium" : "Low",
          aiGeneratedAt: null,

          approvedBy: null,
          approvedAt: null,

          vendor_ID: vendor.ID,

          createdAt: new Date(),
          createdBy: "live.import",
          modifiedAt: new Date(),
          modifiedBy: "live.import"
        };

        await tx.run(INSERT.into(PurchaseOrder).entries(po));
        insertedCount++;

        if (insertedCount >= targetInsertCount) {
          break;
        }
      }

      lastProcessedPage = currentPage;
      currentPage++;
      pagesScanned++;
    }

    if (importState) {
      await tx.run(
        UPDATE(LiveImportState)
          .set({
            source: "USAspending.gov API",
            lastPage: lastProcessedPage,
            lastLimit: targetInsertCount,
            lastRunAt: new Date(),
            modifiedAt: new Date(),
            modifiedBy: "live.import"
          })
          .where({ ID: IMPORT_STATE_ID })
      );
    } else {
      await tx.run(
        INSERT.into(LiveImportState).entries({
          ID: IMPORT_STATE_ID,
          source: "USAspending.gov API",
          lastPage: lastProcessedPage,
          lastLimit: targetInsertCount,
          lastRunAt: new Date(),
          createdAt: new Date(),
          createdBy: "live.import",
          modifiedAt: new Date(),
          modifiedBy: "live.import"
        })
      );
    }

    return {
      insertedCount,
      duplicateSkippedCount,
      invalidSkippedCount,
      startPage,
      endPage: lastProcessedPage,
      nextPage: lastProcessedPage + 1,
      message:
        insertedCount > 0
          ? `Successfully imported ${insertedCount} new live procurement records.`
          : "No new records were inserted. Existing duplicate records were skipped."
    };
  } catch (error) {
    console.error("Live procurement import failed:", error);

    return req.error(
      500,
      `Live procurement import failed: ${error.message}`
    );
  }
});

  /**
   * Approve Purchase Order.
   */
  this.on("approvePO", "PurchaseOrder", async (req) => {
    console.log("Approve action triggered");

    const ID = req.params[0].ID;
    const tx = cds.tx(req);

    const po = await tx.read(PurchaseOrder).where({ ID });

    if (!po.length) {
      return req.error(404, "Purchase Order not found");
    }

    const currentPO = po[0];

    if (currentPO.status === "Approved") {
      return req.error(400, "Purchase Order is already approved");
    }

    if (currentPO.status === "Rejected") {
      return req.error(400, "Rejected Purchase Order cannot be approved");
    }

    if (currentPO.aiRecommendation === "Reject") {
      return req.error(
        400,
        "Purchase Order cannot be approved because AI recommendation is Reject"
      );
    }

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Approved",
        approvedBy: req.user?.id || "System",
        approvedAt: new Date()
      })
      .where({ ID });

    return SELECT.one.from(PurchaseOrder).where({ ID });
  });

  /**
   * Reject Purchase Order.
   */
  this.on("rejectPO", "PurchaseOrder", async (req) => {
    console.log("Reject action triggered");

    const ID = req.params[0].ID;
    const tx = cds.tx(req);

    const po = await tx.read(PurchaseOrder).where({ ID });

    if (!po.length) {
      return req.error(404, "Purchase Order not found");
    }

    const currentPO = po[0];

    if (currentPO.status === "Rejected") {
      return req.error(400, "Purchase Order is already rejected");
    }

    if (currentPO.status === "Approved") {
      return req.error(400, "Approved Purchase Order cannot be rejected");
    }

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Rejected"
      })
      .where({ ID });

    return SELECT.one.from(PurchaseOrder).where({ ID });
  });

  /**
   * Generate AI Insight for selected Purchase Order.
   *
   * Flow:
   * 1. Read selected PO.
   * 2. Call OpenRouter/Claude through llmProxy.js.
   * 3. Receive structured JSON:
   *    - riskSummary
   *    - recommendation
   *    - riskLevel
   *    - reason
   * 4. Save values into PurchaseOrder.
   */
  this.on("generatePOInsight", "PurchaseOrder", async (req) => {
    console.log("Generate AI Insight action triggered");

    const ID = req.params[0].ID;
    const tx = cds.tx(req);

    const po = await tx.read(PurchaseOrder).where({ ID });

    if (!po.length) {
      return req.error(404, "Purchase Order not found");
    }

    const currentPO = po[0];

    try {
      const aiInsight = await generatePurchaseOrderInsight(currentPO);

      const riskSummary = aiInsight.riskSummary
        ? aiInsight.riskSummary.substring(0, 1000)
        : "AI risk summary not available.";

      const aiRecommendation = aiInsight.recommendation
        ? aiInsight.recommendation.substring(0, 1000)
        : "Review";

      const aiReason = aiInsight.reason
        ? aiInsight.reason.substring(0, 1000)
        : "AI reason not available.";

      const riskLevel = aiInsight.riskLevel
        ? aiInsight.riskLevel.substring(0, 20)
        : "Medium";

      await tx
        .update(PurchaseOrder)
        .set({
          riskSummary,
          aiRecommendation,
          aiReason,
          riskLevel,
          aiGeneratedAt: new Date()
        })
        .where({ ID });

      return SELECT.one.from(PurchaseOrder).where({ ID });
    } catch (error) {
      console.error("Generate AI Insight failed:", error);

      return req.error(
        500,
        `AI insight generation failed: ${error.message}`
      );
    }
  });
});