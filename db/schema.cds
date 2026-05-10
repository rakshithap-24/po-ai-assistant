namespace sap.cap.poi;

using {managed} from '@sap/cds/common';

entity Vendor {
    key ID      : UUID;
        name    : String(100);
        country : String(50);
        rating  : Integer;
}

entity PurchaseOrder : managed {
  key ID               : UUID;
      poNumber         : String(30);
      description      : String(500);
      amount           : Decimal(15,2);
      currency         : String(5);
      status           : String(30);

      externalAwardId  : String(120);
      externalSource   : String(100);
      importedAt       : Timestamp;

      riskSummary      : String(1000);
      aiRecommendation : String(1000);
      aiReason         : String(1000);
      riskLevel        : String(20);
      aiGeneratedAt    : Timestamp;

      approvedBy       : String(100);
      approvedAt       : Timestamp;

      vendor           : Association to Vendor;
}
entity LiveImportState : managed {
  key ID        : String(50);
      source    : String(100);
      lastPage  : Integer;
      lastLimit : Integer;
      lastRunAt : Timestamp;
}