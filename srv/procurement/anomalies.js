"use strict";

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function findProcurementAnomalies(purchaseOrders, vendors) {
  const vendorById = new Map(vendors.map((vendor) => [vendor.ID, vendor]));
  const ordersByVendor = new Map();
  const seenOrders = new Map();
  const anomalies = [];

  for (const order of purchaseOrders) {
    const amount = Number(order.amount || 0);
    const vendor = vendorById.get(order.vendor_ID);
    const vendorName = vendor?.name || "Unknown Vendor";
    const add = (anomalyType, severity, details) => anomalies.push({
      ID: `${order.ID}-${anomalyType}`.slice(0, 50),
      poNumber: order.poNumber || "",
      vendorName,
      anomalyType,
      severity,
      amount,
      currency: order.currency || "",
      details
    });

    if (order.budgetAmount != null && amount > Number(order.budgetAmount)) {
      add("Budget exceeded", "High", `Amount exceeds budget by ${(amount - Number(order.budgetAmount)).toFixed(2)} ${order.currency || ""}.`);
    }

    if (vendor?.restricted) {
      add("Restricted vendor", "High", "Vendor is marked as restricted.");
    } else if (Number(vendor?.riskScore || 0) >= 70) {
      add("Elevated vendor risk", "Medium", `Vendor risk score is ${vendor.riskScore}.`);
    }

    if (vendor && !vendor.restricted && Number(vendor.riskScore || 0) < 70) {
      const group = ordersByVendor.get(vendor.ID) || [];
      group.push(order);
      ordersByVendor.set(vendor.ID, group);
    }

    const description = String(order.description || "").trim().toLowerCase();
    const duplicateKey = [order.vendor_ID, amount, order.currency, description].join("|");
    if (order.vendor_ID && description && seenOrders.has(duplicateKey)) {
      add("Possible duplicate", "Medium", `Matches purchase order ${seenOrders.get(duplicateKey)} by vendor, amount, currency, and description.`);
    } else if (order.vendor_ID && description) {
      seenOrders.set(duplicateKey, order.poNumber || order.ID);
    }
  }

  for (const orders of ordersByVendor.values()) {
    if (orders.length < 3) continue;
    const baseline = median(orders.map((order) => Number(order.amount || 0)));
    if (baseline <= 0) continue;
    for (const order of orders) {
      const amount = Number(order.amount || 0);
      if (amount >= 25000 && amount > baseline * 3) {
        const vendorName = vendorById.get(order.vendor_ID)?.name || "Unknown Vendor";
        anomalies.push({
          ID: `${order.ID}-spend-outlier`.slice(0, 50),
          poNumber: order.poNumber || "",
          vendorName,
          anomalyType: "Unusual vendor spend",
          severity: "Medium",
          amount,
          currency: order.currency || "",
          details: `Amount is more than three times the vendor median of ${baseline.toFixed(2)} ${order.currency || ""}.`
        });
      }
    }
  }

  const severityRank = { High: 0, Medium: 1, Low: 2 };
  return anomalies
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || right.amount - left.amount)
    .slice(0, 50);
}

module.exports = { findProcurementAnomalies };