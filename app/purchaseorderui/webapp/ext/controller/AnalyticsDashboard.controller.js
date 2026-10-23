sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("po.assistant.purchaseorderui.ext.controller.AnalyticsDashboard", {
    onInit: function () {
      this._queueFilter = "All";
      this._queueSort = "amount-desc";
      this.ensureDatasetAndLoadDashboard();
    },

    ensureDatasetAndLoadDashboard: async function () {
      const progressModel = new JSONModel({ visible: true, percent: 0, message: "Preparing procurement data..." });
      this.getView().setModel(progressModel, "importProgress");
      try {
        progressModel.setData({ visible: true, percent: 20, message: "Checking saved procurement data..." });
        const result = await this.requestImport({ targetLimit: 200, batchSize: 50, maxPages: 2 });
        progressModel.setData({ visible: true, percent: 100, message: result.message });
        await this.loadDashboardData();
        if (result.insertedCount > 0) MessageToast.show(`Loaded ${result.insertedCount} procurement records.`);
      } catch (error) {
        console.error("Dataset check/load failed:", error);
        MessageBox.warning(
          "Dashboard opened, but automatic dataset loading failed.\n\n" +
          error.message +
          "\n\nExisting HANA data will still be shown."
        );
        await this.loadDashboardData();
      } finally {
        progressModel.setProperty("/visible", false);
      }
    },

    requestImport: async function (options) {
      const response = await fetch("/odata/v4/po/ensureProcurementDatasetLoaded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options)
      });
      const payload = await response.text();
      let result;
      try {
        result = JSON.parse(payload);
      } catch {
        throw new Error(response.ok ? "Dataset service returned an invalid response." : `Dataset loading failed (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(result?.error?.message || result?.message || `Dataset loading failed (HTTP ${response.status}).`);
      }
      return result;
    },

    onLoadMoreData: async function () {
      const importModel = this.getView().getModel("import");
      const progressModel = this.getView().getModel("importProgress");
      const currentCount = Number(importModel?.getProperty("/loadedCount") || 0);
      const targetLimit = Math.min(currentCount + 500, 5000);
      if (targetLimit <= currentCount) return;

      progressModel.setData({ visible: true, percent: 10, message: `Loading next batch (target ${targetLimit})...` });
      this.byId("loadMoreDataButton").setEnabled(false);
      try {
        const result = await this.requestImport({ targetLimit, batchSize: 100, maxPages: 10 });
        progressModel.setData({ visible: true, percent: 100, message: result.message });
        await this.loadDashboardData();
        MessageToast.show(result.insertedCount > 0
          ? `Added ${result.insertedCount} records. ${result.currentCount} total are available.`
          : result.message);
      } catch (error) {
        MessageBox.error(`Could not load more procurement data.\n\n${error.message}`);
      } finally {
        progressModel.setProperty("/visible", false);
        this.byId("loadMoreDataButton").setEnabled(true);
      }
    },

    fetchODataCollection: async function (sPath) {
      const response = await fetch(`/odata/v4/po/${sPath}`);

      if (!response.ok) {
        throw new Error(`Failed to load ${sPath}. HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.value || [];
    },

    fetchOptionalODataCollection: async function (sPath) {
      try {
        return await this.fetchODataCollection(sPath);
      } catch (error) {
        if (error.message.includes("HTTP 403")) {
          return [];
        }
        throw error;
      }
    },

    loadDashboardData: async function () {
      try {
        const [
          summary,
          risk,
          status,
          vendor,
          recommendation,
          highRisk,
          importOverview,
          approvalQueue,
          auditEvents,
          anomalies,
          purchaseOrders,
          trends
        ] = await Promise.all([
          this.fetchODataCollection("AnalyticsSummary"),
          this.fetchODataCollection("RiskDistribution"),
          this.fetchODataCollection("StatusDistribution"),
          this.fetchODataCollection("VendorSpendAnalytics"),
          this.fetchODataCollection("RecommendationDistribution"),
          this.fetchODataCollection("RecentHighRiskPO"),
          this.fetchODataCollection("LiveImportOverview"),
          this.fetchOptionalODataCollection("ApprovalTask?$filter=status%20eq%20'Pending'&$orderby=dueAt"),
          this.fetchOptionalODataCollection("ApprovalAuditEvent?$orderby=createdAt%20desc&$top=10"),
          this.fetchODataCollection("ProcurementAnomaly"),
          this.fetchODataCollection("PurchaseOrder?$select=ID,poNumber,description,amount,currency,status,riskLevel,aiRecommendation,aiReason,aiGeneratedAt,externalSource,createdAt,approvedAt&$expand=vendor($select=name)&$top=500"),
          this.fetchODataCollection("ProcurementTrend")
        ]);

        this.getView().setModel(new JSONModel(summary[0] || {}), "summary");
        this.getView().setModel(new JSONModel({ items: risk }), "risk");
        this.getView().setModel(new JSONModel({ items: status }), "status");
        this.getView().setModel(new JSONModel({ items: vendor }), "vendor");
        this.getView().setModel(new JSONModel({ items: recommendation }), "recommendation");
        this.getView().setModel(new JSONModel({ items: highRisk }), "highRisk");
        this.getView().setModel(new JSONModel(importOverview[0] || {}), "import");
        this.getView().setModel(new JSONModel({ items: approvalQueue }), "approvalQueue");
        this.getView().setModel(new JSONModel({ items: auditEvents }), "auditEvents");
        this.getView().setModel(new JSONModel({ items: anomalies }), "anomalies");
        const overdueTaskIDs = approvalQueue
          .filter((task) => task.dueAt && new Date(task.dueAt) < new Date())
          .map((task) => task.purchaseOrder_ID);
        this._overdueTaskIDs = new Set(overdueTaskIDs);
        const displayOrders = purchaseOrders.map((purchaseOrder) => ({
          ...purchaseOrder,
          riskLevel: purchaseOrder.externalSource === "USAspending.gov API" &&
            !purchaseOrder.aiGeneratedAt &&
            (!purchaseOrder.aiRecommendation || purchaseOrder.aiRecommendation === "Pending")
            ? "Unassessed"
            : purchaseOrder.riskLevel
        }));
        this.getView().setModel(new JSONModel({
          items: this.sortQueue(displayOrders),
          allItems: displayOrders
        }), "reviewQueue");
        this.getView().setModel(new JSONModel({ items: trends }), "trends");

        setTimeout(() => {
          this.applyChartStyling();
        }, 500);
      } catch (error) {
        console.error("Dashboard load failed:", error);

        MessageBox.error(
          `Failed to load analytics dashboard.\n\n${error.message}`
        );
      }
    },

    applyChartStyling: function () {
      const chartConfigs = [
        {
          id: "riskChart",
          colors: ["#d20a0a", "#e9730c", "#188918", "#5b738b"]
        },
        {
          id: "statusChart",
          colors: ["#e9730c", "#188918", "#d20a0a", "#0070f2"]
        },
        {
          id: "vendorChart",
          colors: ["#0070f2"]
        },
        {
          id: "recommendationChart",
          colors: ["#188918", "#e9730c", "#d20a0a", "#5b738b"]
        },
        {
          id: "monthlySpendTrendChart",
          colors: ["#0070f2"]
        },
        {
          id: "approvalTurnaroundTrendChart",
          colors: ["#188918"]
        }
      ];
      chartConfigs.forEach((config) => {
        const chart = this.byId(config.id);

        if (!chart) {
          return;
        }

        chart.setVizProperties({
          plotArea: {
            dataLabel: {
              visible: true
            },
            colorPalette: config.colors
          },
          legend: {
            visible: true
          },
          title: {
            visible: false
          }
        });
      });
    },

    onRefresh: function () {
      this.loadDashboardData();
    },

    onKpiPress: function (event) {
      const filter = event.getSource().data("queueFilter") || "All";
      this._queueFilter = filter;
      this.applyQueueFilter();
      this.byId("reviewQueuePanel")?.$().get(0)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },

    onQueueFilterChange: function (event) {
      this._queueFilter = event.getParameter("key") || "All";
      this.applyQueueFilter();
    },

    onQueueSortChange: function (event) {
      this._queueSort = event.getParameter("selectedItem")?.getKey() || "amount-desc";
      this.applyQueueFilter();
    },

    applyQueueFilter: function () {
      const model = this.getView().getModel("reviewQueue");
      const purchaseOrders = model?.getProperty("/allItems") || model?.getProperty("/items") || [];
      const filteredOrders = purchaseOrders.filter((purchaseOrder) => {
        switch (this._queueFilter) {
          case "Pending": return purchaseOrder.status === "Pending";
          case "High risk": return purchaseOrder.riskLevel === "High";
          case "AI review": return !purchaseOrder.aiGeneratedAt || purchaseOrder.aiRecommendation === "Pending";
          case "Overdue": return this._overdueTaskIDs?.has(purchaseOrder.ID) || false;
          default: return true;
        }
      });
      model.setProperty("/items", this.sortQueue(filteredOrders));
    },

    sortQueue: function (purchaseOrders) {
      const sorters = {
        "amount-desc": (left, right) => Number(right.amount || 0) - Number(left.amount || 0),
        "amount-asc": (left, right) => Number(left.amount || 0) - Number(right.amount || 0),
        "risk": (left, right) => ["High", "Medium", "Low", "Unassessed"].indexOf(left.riskLevel) - ["High", "Medium", "Low", "Unassessed"].indexOf(right.riskLevel),
        "recent": (left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)
      };
      return [...purchaseOrders].sort(sorters[this._queueSort] || sorters["amount-desc"]);
    },

    onQueueItemPress: function (event) {
      const purchaseOrder = event.getSource().getBindingContext("reviewQueue")?.getObject();
      if (purchaseOrder?.ID) {
        window.location.href = `./index.html#/PurchaseOrder(${encodeURIComponent(purchaseOrder.ID)})`;
      }
    },

    onOpenPurchaseOrders: function () {
      window.location.href = "./index.html?page=purchaseorders";
    },

    formatCurrency: function (value) {
      const numberValue = Number(value || 0);

      return numberValue.toLocaleString("en-US", {
        maximumFractionDigits: 2
      });
    },

    formatShortCurrency: function (value) {
      const numberValue = Number(value || 0);

      if (numberValue >= 1000000000) {
        return `${(numberValue / 1000000000).toFixed(1)}B`;
      }

      if (numberValue >= 1000000) {
        return `${(numberValue / 1000000).toFixed(1)}M`;
      }

      if (numberValue >= 1000) {
        return `${(numberValue / 1000).toFixed(1)}K`;
      }

      return numberValue.toFixed(0);
    },

    formatImportDate: function (value) {
      if (!value) return "Not yet run";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "Not yet run" : date.toLocaleString();
    },

    formatRiskLabel: function (riskLevel) {
      return riskLevel === "Unassessed" ? "Not assessed" : riskLevel || "Not assessed";
    },

    stateForRisk: function (riskLevel) {
      switch (riskLevel) {
        case "High":
          return "Error";
        case "Medium":
          return "Warning";
        case "Low":
          return "Success";
        default:
          return "None";
      }
    },

    stateForStatus: function (status) {
      switch (status) {
        case "Approved":
          return "Success";
        case "Rejected":
          return "Error";
        case "Pending":
          return "Warning";
        case "Draft":
          return "Information";
        default:
          return "None";
      }
    },

    stateForRecommendation: function (recommendation) {
      switch (recommendation) {
        case "Approve":
          return "Success";
        case "Reject":
          return "Error";
        case "Review":
          return "Warning";
        case "Pending":
          return "Information";
        default:
          return "None";
      }
    }
  });
});