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
  const { PurchaseOrder, Vendor } = this.entities;

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
   * Flow:
   * 1. Fetch live award/procurement records.
   * 2. Create Vendor if not already available.
   * 3. Create PurchaseOrder in SAP HANA Cloud.
   * 4. Skip duplicate records using externalAwardId.
   */
  this.on("importLiveProcurementData", async (req) => {
    console.log("Import Live Procurement Data action triggered");

    const tx = cds.tx(req);

    try {
      const requestedLimit = Number(req.data?.limit || 50);
      const importLimit = Math.min(requestedLimit, 100);

      const requestedPage = Number(req.data?.page || 1);
      const importPage = Math.max(requestedPage, 1);

      const liveAwards = await fetchLiveProcurementAwards(importLimit, importPage);

      const importedPurchaseOrders = [];

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
          console.warn("Skipping invalid live award record:", award);
          continue;
        }

        /**
         * Skip duplicate imports.
         */
        const existingPO = await tx.run(
          SELECT.one.from(PurchaseOrder).where({ externalAwardId })
        );

        if (existingPO) {
          importedPurchaseOrders.push(existingPO);
          continue;
        }

        /**
         * Find or create vendor.
         */
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

        /**
         * Create Purchase Order from live data.
         */
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
          aiReason: "Live procurement data imported. AI insight has not been generated yet.",
          riskLevel: amount >= 50000 ? "High" : amount >= 15000 ? "Medium" : "Low",
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

        const insertedPO = await tx.run(
          SELECT.one.from(PurchaseOrder).where({ ID: po.ID })
        );

        importedPurchaseOrders.push(insertedPO);
      }

      if (!importedPurchaseOrders.length) {
        return req.error(404, "No valid live procurement records were imported.");
      }

      console.log(`Imported/returned ${importedPurchaseOrders.length} live PO records`);

      return importedPurchaseOrders;
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