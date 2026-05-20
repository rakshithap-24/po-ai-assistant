using { sap.cap.poi as db } from '../db/schema';

type ImportLiveProcurementResult {
  insertedCount          : Integer;
  duplicateSkippedCount  : Integer;
  invalidSkippedCount    : Integer;
  startPage              : Integer;
  endPage                : Integer;
  nextPage               : Integer;
  message                : String;
}

service POService {

    entity Vendor as projection on db.Vendor;

    entity LiveImportState as projection on db.LiveImportState;

    entity PurchaseOrder as projection on db.PurchaseOrder
        actions {
            @Common.SideEffects: { TargetProperties: [
                'status',
                'approvedBy',
                'approvedAt'
            ]}
            action approvePO() returns PurchaseOrder;

            @Common.SideEffects: { TargetProperties: [
                'status'
            ]}
            action rejectPO() returns PurchaseOrder;

            @Common.SideEffects: { TargetProperties: [
                'riskSummary',
                'aiRecommendation',
                'aiReason',
                'riskLevel',
                'aiGeneratedAt'
            ]}
            action generatePOInsight() returns PurchaseOrder;
        };

    @readonly
    @cds.persistence.skip
    entity AnalyticsSummary {
      key ID              : String(30);
          totalPOs        : Integer;
          totalSpend      : Decimal(18,2);
          highRiskCount   : Integer;
          mediumRiskCount : Integer;
          lowRiskCount    : Integer;
          pendingCount    : Integer;
          approvedCount   : Integer;
          rejectedCount   : Integer;
          aiPendingCount  : Integer;
          averagePOValue  : Decimal(18,2);
          highestPOAmount : Decimal(18,2);
    }

    @readonly
    @cds.persistence.skip
    entity RiskDistribution {
      key riskLevel  : String(20);
          count      : Integer;
          totalSpend : Decimal(18,2);
    }

    @readonly
    @cds.persistence.skip
    entity StatusDistribution {
      key status : String(30);
          count  : Integer;
    }

    @readonly
    @cds.persistence.skip
    entity VendorSpendAnalytics {
      key vendorName : String(100);
          totalSpend : Decimal(18,2);
          poCount    : Integer;
    }

    @readonly
    @cds.persistence.skip
    entity RecommendationDistribution {
      key recommendation : String(100);
          count          : Integer;
    }

    @readonly
    @cds.persistence.skip
    entity RecentHighRiskPO {
      key ID             : UUID;
          poNumber       : String(30);
          vendorName     : String(100);
          description    : String(500);
          amount         : Decimal(18,2);
          currency       : String(5);
          status         : String(30);
          riskLevel      : String(20);
          recommendation : String(100);
    }

    @readonly
    @cds.persistence.skip
    entity LiveImportOverview {
      key ID        : String(50);
          source    : String(100);
          lastPage  : Integer;
          lastLimit : Integer;
          lastRunAt : Timestamp;
    }

    action importLiveProcurementData(limit: Integer) returns ImportLiveProcurementResult;
    action ensureProcurementDatasetLoaded(
  targetLimit : Integer,
  batchSize   : Integer
) returns ImportLiveProcurementResult;
}