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

/**
 * Convert HANA decimal/string values safely into JS number.
 */
function toNumberValue(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/**
 * Round monetary values.
 */
function roundCurrency(value) {
  return Number(toNumberValue(value).toFixed(2));
}

/**
 * Normalize empty text for analytics grouping.
 */
function normalizeText(value, fallback) {
  if (!value || String(value).trim() === "") {
    return fallback;
  }

  return String(value).trim();
}

/**
 * Read PurchaseOrder and Vendor data for analytics.
 */
async function readPOsAndVendors(tx, PurchaseOrder, Vendor) {
  const purchaseOrders = await tx.run(SELECT.from(PurchaseOrder));
  const vendors = await tx.run(SELECT.from(Vendor));

  const vendorMap = new Map();

  for (const vendor of vendors) {
    vendorMap.set(vendor.ID, vendor.name);
  }

  return {
    purchaseOrders,
    vendorMap
  };
}

/**
 * Generic distribution builder for charts.
 */
function buildDistribution(items, keyGetter) {
  const map = new Map();

  for (const item of items) {
    const key = keyGetter(item);
    const amount = toNumberValue(item.amount);

    if (!map.has(key)) {
      map.set(key, {
        key,
        count: 0,
        totalSpend: 0
      });
    }

    const entry = map.get(key);
    entry.count += 1;
    entry.totalSpend += amount;
  }

  return Array.from(map.values());
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
   * Analytics Summary for KPI cards.
   */
  this.on("READ", "AnalyticsSummary", async (req) => {
    const tx = cds.tx(req);

    const { purchaseOrders } = await readPOsAndVendors(
      tx,
      PurchaseOrder,
      Vendor
    );

    const totalPOs = purchaseOrders.length;

    const totalSpend = purchaseOrders.reduce(
      (sum, po) => sum + toNumberValue(po.amount),
      0
    );

    const highRiskCount = purchaseOrders.filter(
      (po) => po.riskLevel === "High"
    ).length;

    const mediumRiskCount = purchaseOrders.filter(
      (po) => po.riskLevel === "Medium"
    ).length;

    const lowRiskCount = purchaseOrders.filter(
      (po) => po.riskLevel === "Low"
    ).length;

    const pendingCount = purchaseOrders.filter(
      (po) => po.status === "Pending"
    ).length;

    const approvedCount = purchaseOrders.filter(
      (po) => po.status === "Approved"
    ).length;

    const rejectedCount = purchaseOrders.filter(
      (po) => po.status === "Rejected"
    ).length;

    const aiPendingCount = purchaseOrders.filter(
      (po) =>
        !po.aiGeneratedAt ||
        !po.aiRecommendation ||
        po.aiRecommendation === "Pending"
    ).length;

    const highestPOAmount = purchaseOrders.reduce(
      (max, po) => Math.max(max, toNumberValue(po.amount)),
      0
    );

    return [
      {
        ID: "SUMMARY",
        totalPOs,
        totalSpend: roundCurrency(totalSpend),
        highRiskCount,
        mediumRiskCount,
        lowRiskCount,
        pendingCount,
        approvedCount,
        rejectedCount,
        aiPendingCount,
        averagePOValue:
          totalPOs > 0 ? roundCurrency(totalSpend / totalPOs) : 0,
        highestPOAmount: roundCurrency(highestPOAmount)
      }
    ];
  });

  /**
   * Risk Distribution for chart.
   */
  this.on("READ", "RiskDistribution", async (req) => {
    const tx = cds.tx(req);

    const { purchaseOrders } = await readPOsAndVendors(
      tx,
      PurchaseOrder,
      Vendor
    );

    return buildDistribution(purchaseOrders, function (po) {
      return normalizeText(po.riskLevel, "Unclassified");
    }).map((entry) => ({
      riskLevel: entry.key,
      count: entry.count,
      totalSpend: roundCurrency(entry.totalSpend)
    }));
  });

  /**
   * Status Distribution for chart.
   */
  this.on("READ", "StatusDistribution", async (req) => {
    const tx = cds.tx(req);

    const { purchaseOrders } = await readPOsAndVendors(
      tx,
      PurchaseOrder,
      Vendor
    );

    return buildDistribution(purchaseOrders, function (po) {
      return normalizeText(po.status, "Unknown");
    }).map((entry) => ({
      status: entry.key,
      count: entry.count
    }));
  });

  /**
   * Top Vendor Spend Analytics.
   */
  this.on("READ", "VendorSpendAnalytics", async (req) => {
    const tx = cds.tx(req);

    const { purchaseOrders, vendorMap } = await readPOsAndVendors(
      tx,
      PurchaseOrder,
      Vendor
    );

    return buildDistribution(purchaseOrders, function (po) {
      return vendorMap.get(po.vendor_ID) || "Unknown Vendor";
    })
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10)
      .map((entry) => ({
        vendorName: entry.key.substring(0, 100),
        totalSpend: roundCurrency(entry.totalSpend),
        poCount: entry.count
      }));
  });

  /**
   * AI Recommendation Distribution.
   */
  this.on("READ", "RecommendationDistribution", async (req) => {
    const tx = cds.tx(req);

    const { purchaseOrders } = await readPOsAndVendors(
      tx,
      PurchaseOrder,
      Vendor
    );

    return buildDistribution(purchaseOrders, function (po) {
      return normalizeText(po.aiRecommendation, "Pending").substring(0, 100);
    }).map((entry) => ({
      recommendation: entry.key,
      count: entry.count
    }));
  });

  /**
   * Recent High-Risk Purchase Orders for dashboard table.
   */
  this.on("READ", "RecentHighRiskPO", async (req) => {
    const tx = cds.tx(req);

    const { purchaseOrders, vendorMap } = await readPOsAndVendors(
      tx,
      PurchaseOrder,
      Vendor
    );

    return purchaseOrders
      .filter((po) => po.riskLevel === "High")
      .sort((a, b) => toNumberValue(b.amount) - toNumberValue(a.amount))
      .slice(0, 10)
      .map((po) => ({
        ID: po.ID,
        poNumber: po.poNumber,
        vendorName: vendorMap.get(po.vendor_ID) || "Unknown Vendor",
        description: po.description,
        amount: roundCurrency(po.amount),
        currency: po.currency,
        status: po.status,
        riskLevel: po.riskLevel,
        recommendation: po.aiRecommendation || "Pending"
      }));
  });

  /**
   * Live Import Overview for dashboard.
   */
  this.on("READ", "LiveImportOverview", async (req) => {
    const tx = cds.tx(req);

    const state = await tx.run(
      SELECT.one
        .from(LiveImportState)
        .where({ ID: "USA_SPENDING_PO_IMPORT" })
    );

    if (!state) {
      return [
        {
          ID: "USA_SPENDING_PO_IMPORT",
          source: "USAspending.gov API",
          lastPage: 0,
          lastLimit: 50,
          lastRunAt: null
        }
      ];
    }

    return [
      {
        ID: state.ID,
        source: state.source,
        lastPage: state.lastPage,
        lastLimit: state.lastLimit,
        lastRunAt: state.lastRunAt
      }
    ];
  });

  /**
   * Import live procurement-like data from USAspending API.
   *
   * Flow:
   * 1. Read last imported USAspending page from HANA.
   * 2. Automatically import the next page.
   * 3. Scan up to 10 pages to insert the requested number of new records.
   * 4. Create Vendor if missing.
   * 5. Insert PurchaseOrder into HANA.
   * 6. Skip duplicates using externalAwardId.
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

      const maxPagesToScan = 10;
      let pagesScanned = 0;

      while (
        insertedCount < targetInsertCount &&
        pagesScanned < maxPagesToScan
      ) {
        console.log(
          `Fetching USAspending page ${currentPage}, target new records: ${targetInsertCount}`
        );

        const liveAwards = await fetchLiveProcurementAwards(
          targetInsertCount,
          currentPage
        );

        if (!liveAwards || !liveAwards.length) {
          console.log(
            `No records returned from USAspending page ${currentPage}`
          );
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
   * Ensure procurement dataset is loaded up to a target limit.
   *
   * This is used by the Dashboard.
   * Flow:
   * 1. Count existing live USAspending records in HANA.
   * 2. If count is already >= targetLimit, do not import anything.
   * 3. If count is less than targetLimit, import more records in batches.
   * 4. Stop once HANA has targetLimit records or API returns no more records.
   */
  this.on("ensureProcurementDatasetLoaded", async (req) => {
    console.log("Ensure Procurement Dataset Loaded action triggered");

    const tx = cds.tx(req);
    const IMPORT_STATE_ID = "USA_SPENDING_PO_IMPORT";

    try {
      const requestedTargetLimit = Number(req.data?.targetLimit || 2000);
      const targetLimit = Math.min(requestedTargetLimit, 2000);

      const requestedBatchSize = Number(req.data?.batchSize || 100);
      const batchSize = Math.min(Math.max(requestedBatchSize, 1), 100);

      const existingLivePOs = await tx.run(
        SELECT.from(PurchaseOrder)
          .columns("ID")
          .where({ externalSource: "USAspending.gov API" })
      );

      let currentLiveCount = existingLivePOs.length;

      if (currentLiveCount >= targetLimit) {
        return {
          insertedCount: 0,
          duplicateSkippedCount: 0,
          invalidSkippedCount: 0,
          startPage: 0,
          endPage: 0,
          nextPage: 0,
          message: `Dataset already loaded. HANA already has ${currentLiveCount} live procurement records.`
        };
      }

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

      const maxPagesToScan = 100;
      let pagesScanned = 0;

      while (
        currentLiveCount < targetLimit &&
        pagesScanned < maxPagesToScan
      ) {
        const remainingToImport = targetLimit - currentLiveCount;
        const currentBatchSize = Math.min(batchSize, remainingToImport);

        console.log(
          `Bulk sync page ${currentPage}. Current live count=${currentLiveCount}, target=${targetLimit}, batch=${currentBatchSize}`
        );

        const liveAwards = await fetchLiveProcurementAwards(
          currentBatchSize,
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
            createdBy: "live.bulk.import",
            modifiedAt: new Date(),
            modifiedBy: "live.bulk.import"
          };

          await tx.run(INSERT.into(PurchaseOrder).entries(po));

          insertedCount++;
          currentLiveCount++;

          if (currentLiveCount >= targetLimit) {
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
              lastLimit: batchSize,
              lastRunAt: new Date(),
              modifiedAt: new Date(),
              modifiedBy: "live.bulk.import"
            })
            .where({ ID: IMPORT_STATE_ID })
        );
      } else {
        await tx.run(
          INSERT.into(LiveImportState).entries({
            ID: IMPORT_STATE_ID,
            source: "USAspending.gov API",
            lastPage: lastProcessedPage,
            lastLimit: batchSize,
            lastRunAt: new Date(),
            createdAt: new Date(),
            createdBy: "live.bulk.import",
            modifiedAt: new Date(),
            modifiedBy: "live.bulk.import"
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
            ? `Dataset sync completed. Inserted ${insertedCount} new records. HANA now has approximately ${currentLiveCount} live procurement records.`
            : `No new records inserted. HANA currently has ${currentLiveCount} live procurement records.`
      };
    } catch (error) {
      console.error("Dataset auto-load failed:", error);

      return req.error(
        500,
        `Dataset auto-load failed: ${error.message}`
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