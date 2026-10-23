require("dotenv").config();

const cds = require("@sap/cds");
const { generatePurchaseOrderInsight } = require("./ai/llmProxy");
const { fetchLiveProcurementAwards } = require("./external/usaspendingService");
const { evaluatePurchaseOrderPolicy } = require("./procurement/policy");
const { findProcurementAnomalies } = require("./procurement/anomalies");
const { prepareAwardRecords } = require("./procurement/importRecords");

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

function effectiveRiskLevel(purchaseOrder) {
  if (
    purchaseOrder.externalSource === "USAspending.gov API" &&
    !purchaseOrder.aiGeneratedAt &&
    (!purchaseOrder.aiRecommendation || purchaseOrder.aiRecommendation === "Pending")
  ) {
    return "Unassessed";
  }

  return normalizeText(purchaseOrder.riskLevel, "Unassessed");
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
  const {
    PurchaseOrder,
    Vendor,
    LiveImportState,
    ApprovalPolicy,
    ApprovalTask,
    ApprovalAuditEvent
  } = this.entities;

  async function writeAudit(tx, purchaseOrderID, eventType, req, details) {
    await tx.run(INSERT.into(ApprovalAuditEvent).entries({
      ID: cds.utils.uuid(),
      eventType,
      actor: req.user?.id || "system",
      details: JSON.stringify(details || {}),
      purchaseOrder_ID: purchaseOrderID,
      createdAt: new Date(),
      createdBy: req.user?.id || "system",
      modifiedAt: new Date(),
      modifiedBy: req.user?.id || "system"
    }));
  }

  async function evaluatePolicy(tx, purchaseOrder) {
    const policies = await tx.run(SELECT.from(ApprovalPolicy).where({ enabled: true }));
    const vendor = purchaseOrder.vendor_ID
      ? await tx.run(SELECT.one.from(Vendor).where({ ID: purchaseOrder.vendor_ID }))
      : null;
    const evaluation = evaluatePurchaseOrderPolicy(purchaseOrder, policies);

    if (vendor?.restricted) {
      evaluation.findings.push({
        code: "RESTRICTED_VENDOR",
        severity: "block",
        message: "This vendor is marked as restricted. Resolve the vendor restriction before approval."
      });
      evaluation.blocked = true;
    }

    if (vendor && Number(vendor.riskScore || 0) >= 70) {
      evaluation.findings.push({
        code: "VENDOR_RISK_ELEVATED",
        severity: "warning",
        message: "Vendor risk score is elevated; include this in the review decision."
      });
    }

    if (purchaseOrder.vendor_ID) {
      const similarOrders = await tx.run(
        SELECT.from(PurchaseOrder)
          .columns("ID", "poNumber", "description")
          .where({ vendor_ID: purchaseOrder.vendor_ID, amount: purchaseOrder.amount })
      );
      const normalizedDescription = String(purchaseOrder.description || "")
        .trim()
        .toLowerCase();
      const likelyDuplicate = similarOrders.find((candidate) =>
        candidate.ID !== purchaseOrder.ID &&
        normalizedDescription.length > 0 &&
        String(candidate.description || "").trim().toLowerCase() === normalizedDescription
      );
      if (likelyDuplicate) {
        evaluation.findings.push({
          code: "POSSIBLE_DUPLICATE",
          severity: "warning",
          message: `A similar amount for this vendor already exists (${likelyDuplicate.poNumber || likelyDuplicate.ID}).`
        });
      }
    }

    if (purchaseOrder.budgetAmount != null && Number(purchaseOrder.amount) > Number(purchaseOrder.budgetAmount)) {
      evaluation.findings.push({
        code: "BUDGET_EXCEEDED",
        severity: "block",
        message: "Purchase order amount exceeds its recorded budget."
      });
      evaluation.blocked = true;
    }

    return evaluation;
  }

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

  this.before("UPDATE", "PurchaseOrder", async (req) => {
    if (!Object.hasOwn(req.data, "status")) return;
    const ID = req.data.ID || req.params?.[0]?.ID;
    if (!ID) return req.error(400, "Purchase Order ID is required for status validation");
    const current = await cds.tx(req).run(
      SELECT.one.from(PurchaseOrder).columns("status").where({ ID })
    );
    if (current && req.data.status !== current.status) {
      return req.error(400, "Change purchase-order status through the approval workflow actions");
    }
  });

  this.on("READ", "ProcurementAnomaly", async (req) => {
    const tx = cds.tx(req);
    const [purchaseOrders, vendors] = await Promise.all([
      tx.run(SELECT.from(PurchaseOrder)),
      tx.run(SELECT.from(Vendor))
    ]);
    return findProcurementAnomalies(purchaseOrders, vendors);
  });

  this.on("READ", "ProcurementTrend", async (req) => {
    const tx = cds.tx(req);
    const purchaseOrders = await tx.run(SELECT.from(PurchaseOrder));
    const months = new Map();

    for (const purchaseOrder of purchaseOrders) {
      const createdAt = purchaseOrder.createdAt ? new Date(purchaseOrder.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
      const month = createdAt.toISOString().slice(0, 7);
      const entry = months.get(month) || {
        month,
        orderCount: 0,
        totalSpend: 0,
        approvedCount: 0,
        approvalDaysTotal: 0,
        approvalDaysCount: 0
      };
      entry.orderCount += 1;
      entry.totalSpend += toNumberValue(purchaseOrder.amount);
      if (purchaseOrder.status === "Approved") {
        entry.approvedCount += 1;
        const approvedAt = purchaseOrder.approvedAt ? new Date(purchaseOrder.approvedAt) : null;
        if (approvedAt && !Number.isNaN(approvedAt.getTime())) {
          entry.approvalDaysTotal += Math.max(0, approvedAt - createdAt) / 86400000;
          entry.approvalDaysCount += 1;
        }
      }
      months.set(month, entry);
    }

    return Array.from(months.values())
      .sort((left, right) => left.month.localeCompare(right.month))
      .slice(-12)
      .map((entry) => ({
        month: entry.month,
        orderCount: entry.orderCount,
        totalSpend: roundCurrency(entry.totalSpend),
        approvedCount: entry.approvedCount,
        averageApprovalDays: entry.approvalDaysCount
          ? Number((entry.approvalDaysTotal / entry.approvalDaysCount).toFixed(2))
          : 0
      }));
  });

  this.after("CREATE", "PurchaseOrder", async (purchaseOrder, req) => {
    const tx = cds.tx(req);
    await writeAudit(tx, purchaseOrder.ID, "CREATED", req, {
      status: purchaseOrder.status,
      amount: purchaseOrder.amount,
      currency: purchaseOrder.currency
    });
  });

  this.on("evaluatePurchaseOrderPolicy", async (req) => {
    const tx = cds.tx(req);
    const purchaseOrder = await tx.run(
      SELECT.one.from(PurchaseOrder).where({ ID: req.data.purchaseOrderID })
    );
    if (!purchaseOrder) return req.error(404, "Purchase Order not found");

    const evaluation = await evaluatePolicy(tx, purchaseOrder);
    return {
      blocked: evaluation.blocked,
      requiredApprovals: evaluation.requiredApprovals,
      findings: JSON.stringify(evaluation.findings),
      policyName: evaluation.policy?.name || "Default policy"
    };
  });

  this.on("submitForApproval", "PurchaseOrder", async (req) => {
    const tx = cds.tx(req);
    const ID = req.params[0].ID;
    const purchaseOrder = await tx.run(SELECT.one.from(PurchaseOrder).where({ ID }));
    if (!purchaseOrder) return req.error(404, "Purchase Order not found");
    if (["Approved", "Rejected"].includes(purchaseOrder.status)) {
      return req.error(400, "A completed purchase order cannot be submitted for approval");
    }

    const evaluation = await evaluatePolicy(tx, purchaseOrder);
    if (evaluation.blocked) {
      await writeAudit(tx, ID, "POLICY_BLOCKED", req, { findings: evaluation.findings });
      return req.error(400, `Policy checks blocked submission: ${evaluation.findings.map((finding) => finding.message).join(" ")}`);
    }

    const existingTasks = await tx.run(SELECT.from(ApprovalTask).where({ purchaseOrder_ID: ID }));
    if (existingTasks.length) {
      await tx.run(DELETE.from(ApprovalTask).where({ purchaseOrder_ID: ID }));
    }

    const now = new Date();
    const tasks = Array.from({ length: evaluation.requiredApprovals }, (_, index) => ({
      ID: cds.utils.uuid(),
      sequence: index + 1,
      status: index === 0 ? "Pending" : "Queued",
      approverRole: "POApprover",
      assignedTo: null,
      dueAt: new Date(now.getTime() + (index + 1) * 24 * 60 * 60 * 1000),
      purchaseOrder_ID: ID,
      createdAt: now,
      createdBy: req.user?.id || "system",
      modifiedAt: now,
      modifiedBy: req.user?.id || "system"
    }));
    await tx.run(INSERT.into(ApprovalTask).entries(tasks));
    await tx.run(UPDATE(PurchaseOrder).set({ status: "Pending" }).where({ ID }));
    await writeAudit(tx, ID, "SUBMITTED_FOR_APPROVAL", req, {
      policy: evaluation.policy?.name || "Default policy",
      requiredApprovals: evaluation.requiredApprovals
    });
    return SELECT.one.from(PurchaseOrder).where({ ID });
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
      (po) => effectiveRiskLevel(po) === "High"
    ).length;

    const mediumRiskCount = purchaseOrders.filter(
      (po) => effectiveRiskLevel(po) === "Medium"
    ).length;

    const lowRiskCount = purchaseOrders.filter(
      (po) => effectiveRiskLevel(po) === "Low"
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
      return effectiveRiskLevel(po);
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
      .filter((po) => effectiveRiskLevel(po) === "High")
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
        riskLevel: effectiveRiskLevel(po),
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
      const liveRecords = await tx.run(
        SELECT.from(PurchaseOrder)
          .columns("ID")
          .where({ externalSource: "USAspending.gov API" })
      );
      return [
        {
          ID: "USA_SPENDING_PO_IMPORT",
          source: "USAspending.gov API",
          lastPage: 0,
          lastLimit: 50,
          lastRunAt: null,
          loadedCount: liveRecords.length
        }
      ];
    }

    return [
      {
        ID: state.ID,
        source: state.source,
        lastPage: state.lastPage,
        lastLimit: state.lastLimit,
        lastRunAt: state.lastRunAt,
        loadedCount: (await tx.run(
          SELECT.from(PurchaseOrder)
            .columns("ID")
            .where({ externalSource: "USAspending.gov API" })
        )).length
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
            riskLevel: "Unassessed",
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
      const targetLimit = Math.min(Math.max(requestedTargetLimit, 1), 5000);

      const requestedBatchSize = Number(req.data?.batchSize || 100);
      const batchSize = Math.min(Math.max(requestedBatchSize, 1), 100);
      const requestedMaxPages = Number(req.data?.maxPages || 5);
      const maxPagesToScan = Math.min(Math.max(requestedMaxPages, 1), 10);

      const existingLivePOs = await tx.run(
        SELECT.from(PurchaseOrder)
          .columns("ID", "externalAwardId")
          .where({ externalSource: "USAspending.gov API" })
      );

      let currentLiveCount = existingLivePOs.length;
      const importedAwardIDs = new Set(existingLivePOs.map((po) => po.externalAwardId));
      const existingVendors = await tx.run(SELECT.from(Vendor).columns("ID", "name"));
      const vendorsByName = new Map(existingVendors.map((vendor) => [vendor.name, vendor]));

      if (currentLiveCount >= targetLimit) {
        return {
          insertedCount: 0,
          duplicateSkippedCount: 0,
          invalidSkippedCount: 0,
          startPage: 0,
          endPage: 0,
          nextPage: 0,
          currentCount: currentLiveCount,
          targetLimit,
          complete: true,
          message: `Dataset already loaded. HANA already has ${currentLiveCount} live procurement records.`
        };
      }

      let importState = await tx.run(
        SELECT.one.from(LiveImportState).where({ ID: IMPORT_STATE_ID })
      );

      const pageSize = 100;
      const cursorPage = importState && Number(importState.lastLimit) !== pageSize
        ? 0
        : Number(importState?.lastPage || 0);

      let currentPage = cursorPage + 1;

      const startPage = currentPage;

      let insertedCount = 0;
      let duplicateSkippedCount = 0;
      let invalidSkippedCount = 0;
      let lastProcessedPage = currentPage - 1;

      let pagesScanned = 0;
      let consecutivePagesWithoutInserts = 0;

      while (
        currentLiveCount < targetLimit &&
        pagesScanned < maxPagesToScan &&
        consecutivePagesWithoutInserts < 3
      ) {
        const currentBatchSize = pageSize;

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

        const insertedBeforePage = insertedCount;
        const prepared = prepareAwardRecords(
          liveAwards,
          importedAwardIDs,
          vendorsByName,
          cds.utils.uuid
        );
        duplicateSkippedCount += prepared.duplicateSkippedCount;
        invalidSkippedCount += prepared.invalidSkippedCount;
        const purchaseOrdersToInsert = prepared.purchaseOrdersToInsert;
        const insertedVendorIDs = new Set(purchaseOrdersToInsert.map((po) => po.vendor_ID));
        const vendorsToInsert = prepared.vendorsToInsert.filter((vendor) => insertedVendorIDs.has(vendor.ID));

        if (vendorsToInsert.length) {
          await tx.run(INSERT.into(Vendor).entries(vendorsToInsert));
        }
        if (purchaseOrdersToInsert.length) {
          await tx.run(INSERT.into(PurchaseOrder).entries(purchaseOrdersToInsert));
          insertedCount += purchaseOrdersToInsert.length;
          currentLiveCount += purchaseOrdersToInsert.length;
        }

        lastProcessedPage = currentPage;
        consecutivePagesWithoutInserts = insertedCount === insertedBeforePage
          ? consecutivePagesWithoutInserts + 1
          : 0;
        currentPage++;
        pagesScanned++;
      }

      if (importState) {
        await tx.run(
          UPDATE(LiveImportState)
            .set({
              source: "USAspending.gov API",
              lastPage: lastProcessedPage,
              lastLimit: pageSize,
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
            lastLimit: pageSize,
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
        currentCount: currentLiveCount,
        targetLimit,
        complete: currentLiveCount >= targetLimit,
        message:
          insertedCount > 0
            ? `Loaded ${insertedCount} new records in this batch. ${currentLiveCount} records are available${currentLiveCount >= targetLimit ? "." : `; this request scanned at most ${maxPagesToScan} pages.`}`
              : `No new records were found in this batch. ${currentLiveCount} records are available.`
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

    const evaluation = await evaluatePolicy(tx, currentPO);
    if (evaluation.blocked) {
      return req.error(400, `Policy checks blocked approval: ${evaluation.findings.map((finding) => finding.message).join(" ")}`);
    }

    const tasks = await tx.run(
      SELECT.from(ApprovalTask)
        .where({ purchaseOrder_ID: ID })
        .orderBy("sequence asc")
    );
    const activeTask = tasks.find((task) => task.status === "Pending");
    if (!activeTask) {
      return req.error(400, "Submit this purchase order for approval before approving it");
    }

    const actor = req.user?.id || "System";
    const now = new Date();
    await tx.run(
      UPDATE(ApprovalTask)
        .set({ status: "Approved", decision: "Approve", completedAt: now, assignedTo: actor, modifiedAt: now, modifiedBy: actor })
        .where({ ID: activeTask.ID })
    );
    const nextTask = tasks.find((task) => task.sequence > activeTask.sequence);
    if (nextTask) {
      await tx.run(
        UPDATE(ApprovalTask)
          .set({ status: "Pending", modifiedAt: now, modifiedBy: actor })
          .where({ ID: nextTask.ID })
      );
      await tx
        .update(PurchaseOrder)
        .set({ status: "Pending" })
        .where({ ID });
      await writeAudit(tx, ID, "APPROVAL_STAGE_COMPLETED", req, {
        sequence: activeTask.sequence,
        nextSequence: nextTask.sequence
      });
      return SELECT.one.from(PurchaseOrder).where({ ID });
    }

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Approved",
        approvedBy: req.user?.id || "System",
        approvedAt: new Date()
      })
      .where({ ID });

    await writeAudit(tx, ID, "APPROVED", req, {
      sequence: activeTask.sequence,
      approvedBy: actor
    });

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

    const tasks = await tx.run(
      SELECT.from(ApprovalTask).where({ purchaseOrder_ID: ID, status: "Pending" })
    );
    const now = new Date();
    const actor = req.user?.id || "System";
    if (tasks[0]) {
      await tx.run(
        UPDATE(ApprovalTask)
          .set({ status: "Rejected", decision: "Reject", completedAt: now, assignedTo: actor, modifiedAt: now, modifiedBy: actor })
          .where({ ID: tasks[0].ID })
      );
    }
    await tx.run(
      UPDATE(ApprovalTask)
        .set({ status: "Cancelled", modifiedAt: now, modifiedBy: actor })
        .where({ purchaseOrder_ID: ID, status: "Queued" })
    );

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Rejected"
      })
      .where({ ID });

    await writeAudit(tx, ID, "REJECTED", req, { rejectedBy: actor });

    return SELECT.one.from(PurchaseOrder).where({ ID });
  });

  this.on("overrideAIInsight", "PurchaseOrder", async (req) => {
    const tx = cds.tx(req);
    const ID = req.params[0].ID;
    const { recommendation, riskLevel, reason } = req.data;
    if (!["Approve", "Review", "Reject"].includes(recommendation)) {
      return req.error(400, "Recommendation must be Approve, Review, or Reject");
    }
    if (!["Low", "Medium", "High"].includes(riskLevel)) {
      return req.error(400, "Risk level must be Low, Medium, or High");
    }
    if (!reason || !reason.trim()) {
      return req.error(400, "A reason is required when overriding AI insight");
    }
    const currentPO = await tx.run(SELECT.one.from(PurchaseOrder).where({ ID }));
    if (!currentPO) return req.error(404, "Purchase Order not found");

    await tx.run(
      UPDATE(PurchaseOrder)
        .set({ aiRecommendation: recommendation, riskLevel, aiReason: reason.substring(0, 1000), aiGeneratedAt: new Date() })
        .where({ ID })
    );
    await writeAudit(tx, ID, "AI_INSIGHT_OVERRIDDEN", req, {
      before: { recommendation: currentPO.aiRecommendation, riskLevel: currentPO.riskLevel },
      after: { recommendation, riskLevel },
      reason: reason.substring(0, 1000)
    });
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
          aiConfidence: aiInsight.confidence,
          aiEvidence: JSON.stringify(aiInsight.evidence),
          aiGeneratedAt: new Date()
        })
        .where({ ID });

      await writeAudit(tx, ID, "AI_INSIGHT_GENERATED", req, {
        recommendation: aiRecommendation,
        riskLevel,
        confidence: aiInsight.confidence,
        evidence: aiInsight.evidence
      });

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