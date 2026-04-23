namespace sap.cap.poi;

entity Vendor{
    key ID: UUID;
        name: String(100);
        country: String(50);
        rating: Integer;
}

entity PurchaseOrder{
    key ID: UUID;
    poNumber: Integer;
    description: String(500);
    amount: Decimal(15,2);
    currency: String(5);
    status: String(30);
    vendor: Association to Vendor;
    
}