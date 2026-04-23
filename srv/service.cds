using {sap.cap.poi as db} from '../db/schema';

service POService{
    entity Vendor as projection on db.Vendor;
    entity PurchaseOrder as projection on db.PurchaseOrder;

    action approvePO(ID:UUID) returns String;
    action generatePOInsight(ID:UUID) returns String;
}