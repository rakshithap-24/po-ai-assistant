using {sap.cap.poi as db} from '../db/schema';

service POService {
    entity Vendor        as projection on db.Vendor;

    entity PurchaseOrder as projection on db.PurchaseOrder
        actions {
            @Common.SideEffects: {TargetProperties: [
                'status',
                'approvedBy',
                'approvedAt'
            ]}
            action approvePO()         returns String;

            @Common.SideEffects: {TargetProperties: ['status']}
            action rejectPO()          returns String;

            @Common.SideEffects: {TargetProperties: [
                'riskSummary',
                'aiRecommendation',
                'aiReason',
                'riskLevel',
                'aiGeneratedAt'
            ]}
            action generatePOInsight() returns String;
        };
}
