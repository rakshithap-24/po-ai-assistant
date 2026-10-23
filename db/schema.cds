namespace sap.cap.poi;

using {managed} from '@sap/cds/common';

entity Vendor {
    key ID      : UUID;
        name    : String(100);
        country : String(50);
        rating  : Integer;
  restricted : Boolean default false;
  riskScore : Decimal(5,2);
  riskNotes : String(1000);
  riskUpdatedAt : Timestamp;
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
      department       : String(100);
      costCenter       : String(50);
      contractReference : String(100);
      budgetAmount     : Decimal(15,2);

      riskSummary      : String(1000);
      aiRecommendation : String(1000);
      aiReason         : String(1000);
      riskLevel        : String(20);
      aiConfidence     : Decimal(5,4);
      aiEvidence       : LargeString;
      aiGeneratedAt    : Timestamp;

      approvedBy       : String(100);
      approvedAt       : Timestamp;

      vendor           : Association to Vendor;
}

    entity ApprovalPolicy : managed {
      key ID                : UUID;
      name              : String(100);
      priority          : Integer default 0;
      enabled           : Boolean default true;
      minimumAmount     : Decimal(15,2) default 0;
      maximumAmount     : Decimal(15,2);
      currency          : String(5);
      department        : String(100);
      riskLevel         : String(20);
      requiredApprovals : Integer default 1;
      requiresAIReview  : Boolean default false;
      requiresContract  : Boolean default false;
      blockHighRisk     : Boolean default false;
    }

    entity ApprovalTask : managed {
      key ID              : UUID;
      sequence        : Integer;
      status          : String(20);
      approverRole    : String(50);
      assignedTo      : String(100);
      dueAt           : Timestamp;
      completedAt     : Timestamp;
      decision        : String(20);
      decisionComment : String(1000);
      purchaseOrder   : Association to PurchaseOrder;
    }

    entity ApprovalAuditEvent : managed {
      key ID            : UUID;
      eventType     : String(50);
      actor         : String(100);
      details       : LargeString;
      purchaseOrder : Association to PurchaseOrder;
    }

entity LiveImportState : managed {
  key ID        : String(50);
      source    : String(100);
      lastPage  : Integer;
      lastLimit : Integer;
      lastRunAt : Timestamp;
}