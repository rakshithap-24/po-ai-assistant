sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, MessageToast, MessageBox, BusyIndicator) {
  "use strict";

  return Controller.extend("po.assistant.purchaseorderui.ext.controller.AnalyticsDashboard", {
    onInit: function () {
      this.ensureDatasetAndLoadDashboard();
    },

    ensureDatasetAndLoadDashboard: async function () {
      try {
        BusyIndicator.show(0);
        MessageToast.show("Checking live procurement dataset...");

        const response = await fetch("/odata/v4/po/ensureProcurementDatasetLoaded", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            targetLimit: 2000,
            batchSize: 100
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error?.message ||
            result?.message ||
            "Dataset loading failed."
          );
        }

        console.log("Dataset load result:", result);

        await this.loadDashboardData();

        MessageToast.show("Dashboard loaded with procurement data from HANA.");
      } catch (error) {
        console.error("Dataset check/load failed:", error);

        MessageBox.warning(
          "Dashboard opened, but automatic dataset loading failed.\n\n" +
          error.message +
          "\n\nExisting HANA data will still be shown."
        );

        await this.loadDashboardData();
      } finally {
        BusyIndicator.hide();
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

    loadDashboardData: async function () {
      try {
        const [
          summary,
          risk,
          status,
          vendor,
          recommendation,
          highRisk,
          importOverview
        ] = await Promise.all([
          this.fetchODataCollection("AnalyticsSummary"),
          this.fetchODataCollection("RiskDistribution"),
          this.fetchODataCollection("StatusDistribution"),
          this.fetchODataCollection("VendorSpendAnalytics"),
          this.fetchODataCollection("RecommendationDistribution"),
          this.fetchODataCollection("RecentHighRiskPO"),
          this.fetchODataCollection("LiveImportOverview")
        ]);

        this.getView().setModel(new JSONModel(summary[0] || {}), "summary");
        this.getView().setModel(new JSONModel({ items: risk }), "risk");
        this.getView().setModel(new JSONModel({ items: status }), "status");
        this.getView().setModel(new JSONModel({ items: vendor }), "vendor");
        this.getView().setModel(new JSONModel({ items: recommendation }), "recommendation");
        this.getView().setModel(new JSONModel({ items: highRisk }), "highRisk");
        this.getView().setModel(new JSONModel(importOverview[0] || {}), "import");

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