using {sap.cap.poi as db} from '../db/schema';

service POService {
    entity Vendor        as projection on db.Vendor;

    entity PurchaseOrder as projection on db.PurchaseOrder
        actions {
            action approvePO()         returns String;
            action rejectPO()          returns String;
            action generatePOInsight() returns String;
        }


}
