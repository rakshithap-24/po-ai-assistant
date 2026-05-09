require("dotenv").config();

const cds = require("@sap/cds");
const { generatePurchaseOrderInsight } = require("./ai/llmProxy");

module.exports = cds.service.impl(async function () {
  const { PurchaseOrder } = this.entities;

  /**
   * Default values and basic validation before creating a Purchase Order.
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
   * Approve Purchase Order action.
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

    await tx
      .update(PurchaseOrder)
      .set({
        status: "Approved",
        approvedBy: req.user?.id || "System",
        approvedAt: new Date()
      })
      .where({ ID });

    return `PO ${currentPO.poNumber || ID} approved successfully`;
  });

  /**
   * Reject Purchase Order action.
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

    return `PO ${currentPO.poNumber || ID} rejected successfully`;
  });

  /**
   * Generate AI Insight action.
   *
   * This action:
   * 1. Reads the selected Purchase Order.
   * 2. Calls OpenRouter through llmProxy.js.
   * 3. Receives structured JSON.
   * 4. Saves short values into HANA-safe fields.
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

      const riskSummary = [
        aiInsight.riskSummary,
        aiInsight.reason ? `Reason: ${aiInsight.reason}` : ""
      ]
        .filter(Boolean)
        .join(" ")
        .substring(0, 1000);

      const aiRecommendation = aiInsight.recommendation.substring(0, 1000);

      await tx
        .update(PurchaseOrder)
        .set({
          riskSummary,
          aiRecommendation
        })
        .where({ ID });

      return `AI insight generated successfully: ${aiRecommendation}`;
    } catch (error) {
      console.error("Generate AI Insight failed:", error);

      return req.error(
        500,
        `AI insight generation failed: ${error.message}`
      );
    }
  });
});