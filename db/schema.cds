namespace sap.cap.poi;
using {managed} from '@sap/cds/common';
entity Vendor{
    key ID: UUID;
        name: String(100);
        country: String(50);
        rating: Integer;
}

entity PurchaseOrder:managed {
  key ID               : UUID;
      poNumber         : String(30);
      description      : String(500);
      amount           : Decimal(15,2);
      currency         : String(5);
      status           : String(30);
      riskSummary      : String(1000);
      aiRecommendation : String(1000);
      approvedBy       :String(100);
      approvedAt       : Timestamp;
      vendor           : Association to Vendor;
}