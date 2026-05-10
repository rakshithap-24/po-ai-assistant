using {sap.cap.poi as db} from '../db/schema';

type ImportLiveProcurementResult {
  insertedCount         : Integer;
  duplicateSkippedCount : Integer;
  invalidSkippedCount   : Integer;
  startPage             : Integer;
  endPage               : Integer;
  nextPage              : Integer;
  message               : String;
}

service POService {
    entity Vendor as projection on db.Vendor;

    entity LiveImportState as projection on db.LiveImportState;

    entity PurchaseOrder as projection on db.PurchaseOrder
        actions {
            @Common.SideEffects: {TargetProperties: [
                'status',
                'approvedBy',
                'approvedAt'
            ]}
            action approvePO() returns PurchaseOrder;

            @Common.SideEffects: {TargetProperties: ['status']}
            action rejectPO() returns PurchaseOrder;

            @Common.SideEffects: {TargetProperties: [
                'riskSummary',
                'aiRecommendation',
                'aiReason',
                'riskLevel',
                'aiGeneratedAt'
            ]}
            action generatePOInsight() returns PurchaseOrder;
        };

    action importLiveProcurementData(limit: Integer) returns ImportLiveProcurementResult;
}