using { sap.cap.poi as db } from '../db/schema';

type ImportLiveProcurementResult {
  insertedCount          : Integer;
  duplicateSkippedCount  : Integer;
  invalidSkippedCount    : Integer;
  startPage              : Integer;
  endPage                : Integer;
  nextPage               : Integer;
  currentCount           : Integer;
  targetLimit            : Integer;
  complete               : Boolean;
  message                : String;
}

type PolicyEvaluationResult {
  blocked           : Boolean;
  requiredApprovals : Integer;
  findings          : LargeString;
  policyName        : String(100);
}

@requires: 'POUser'
service POService {

    @restrict: [
      { grant: 'READ', to: 'POUser' },
      { grant: ['CREATE', 'UPDATE'], to: 'POAdmin' },
      { grant: 'DELETE', to: 'POAdmin' }
    ]
    entity Vendor as projection on db.Vendor;

    entity LiveImportState as projection on db.LiveImportState;

    @requires: 'POAdmin'
    entity ApprovalPolicy as projection on db.ApprovalPolicy;

    @requires: 'POApprover'
    @readonly
    entity ApprovalTask as projection on db.ApprovalTask;

    @requires: 'POApprover'
    @readonly
    entity ApprovalAuditEvent as projection on db.ApprovalAuditEvent;

    @readonly
    @cds.persistence.skip
    entity ProcurementAnomaly {
      key ID          : String(50);
          poNumber    : String(30);
          vendorName  : String(100);
          anomalyType : String(50);
          severity    : String(20);
          amount      : Decimal(15,2);
          currency    : String(5);
          details     : String(500);
    }

    @readonly
    @cds.persistence.skip
    entity ProcurementTrend {
      key month             : String(7);
          orderCount        : Integer;
          totalSpend        : Decimal(18,2);
          approvedCount     : Integer;
          averageApprovalDays : Decimal(10,2);
    }

    @restrict: [
      { grant: 'READ', to: 'POUser' },
      { grant: ['CREATE', 'UPDATE'], to: 'POApprover' },
      { grant: 'DELETE', to: 'POAdmin' }
    ]
    entity PurchaseOrder as projection on db.PurchaseOrder
        actions {
            @Common.SideEffects: { TargetProperties: [
                'status',
                'approvedBy',
                'approvedAt'
            ]}
            @requires: 'POApprover'
            action approvePO() returns PurchaseOrder;

            @Common.SideEffects: { TargetProperties: [
              'status'
            ]}
            @requires: 'POApprover'
            action submitForApproval() returns PurchaseOrder;

            @Common.SideEffects: { TargetProperties: [
                'status'
            ]}
            @requires: 'POApprover'
            action rejectPO() returns PurchaseOrder;

            @Common.SideEffects: { TargetProperties: [
                'riskSummary',
                'aiRecommendation',
                'aiReason',
                'riskLevel',
                'aiGeneratedAt'
            ]}
            @requires: 'POApprover'
            action generatePOInsight() returns PurchaseOrder;

            @Common.SideEffects: { TargetProperties: [
              'aiRecommendation',
              'riskLevel',
              'aiReason',
              'aiGeneratedAt'
            ]}
            @requires: 'POApprover'
            action overrideAIInsight(
              recommendation : String(20),
              riskLevel      : String(20),
              reason         : String(1000)
            ) returns PurchaseOrder;
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
          loadedCount : Integer;
    }

    @requires: 'POAdmin'
    action importLiveProcurementData(limit: Integer) returns ImportLiveProcurementResult;
    @requires: 'POAdmin'
    action ensureProcurementDatasetLoaded(
  targetLimit : Integer,
    batchSize   : Integer,
    maxPages    : Integer
) returns ImportLiveProcurementResult;

  @requires: 'POApprover'
  action evaluatePurchaseOrderPolicy(purchaseOrderID: UUID) returns PolicyEvaluationResult;
}