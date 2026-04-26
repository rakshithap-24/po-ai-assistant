using POService as service from '../../srv/service';

annotate service.PurchaseOrder with @(
    UI.HeaderInfo : {
        TypeName       : 'Purchase Order',
        TypeNamePlural : 'Purchase Orders',
        Title          : { Value : poNumber },
        Description    : { Value : description }
    },

    UI.SelectionFields : [
        poNumber,
        vendor_ID,
        status,
        currency
    ],

    UI.LineItem : [
        { $Type : 'UI.DataField', Label : 'PO Number',   Value : poNumber },
        { $Type : 'UI.DataField', Label : 'Vendor',      Value : vendor.name },
        { $Type : 'UI.DataField', Label : 'Description', Value : description },
        { $Type : 'UI.DataField', Label : 'Amount',      Value : amount },
        { $Type : 'UI.DataField', Label : 'Currency',    Value : currency },
        { $Type : 'UI.DataField', Label : 'Status',      Value : status},
        { $Type : 'UI.DataField', Label : 'Approved By', Value : approvedBy },
{ $Type : 'UI.DataField', Label : 'Approved At', Value : approvedAt },
        { $Type : 'UI.DataFieldForAction', Label : 'Approve',      Action : 'POService.approvePO'},
        { $Type : 'UI.DataFieldForAction', Label : 'Reject',      Action : 'POService.rejectPO'},
        { $Type : 'UI.DataFieldForAction', Label : 'Generate AI Insights',      Action : 'POService.generatePOInsight'}
    ],

    UI.Facets : [
        {
            $Type  : 'UI.ReferenceFacet',
            Label  : 'Purchase Order Details',
            Target : '@UI.FieldGroup#PODetails'
        },
        {
            $Type  : 'UI.ReferenceFacet',
            Label  : 'AI Insights',
            Target : '@UI.FieldGroup#AIInsights'
        },
        {
            $Type  : 'UI.ReferenceFacet',
            Label  : 'Approval Details',
            Target : '@UI.FieldGroup#ApprovalDetails'
        }
    ],

    UI.FieldGroup #PODetails : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'PO Number',      Value : poNumber },
            { $Type : 'UI.DataField', Label : 'Vendor',         Value : vendor.name },
            { $Type : 'UI.DataField', Label : 'Description',    Value : description },
            { $Type : 'UI.DataField', Label : 'Amount',         Value : amount },
            { $Type : 'UI.DataField', Label : 'Currency',       Value : currency },
            { $Type : 'UI.DataField', Label : 'Status',         Value : status }
        ]
    },

    UI.FieldGroup #AIInsights : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'Risk Summary',      Value : riskSummary },
            { $Type : 'UI.DataField', Label : 'AI Recommendation', Value : aiRecommendation }
        ]
    },

    UI.FieldGroup #ApprovalDetails : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'Approved By', Value : approvedBy },
            { $Type : 'UI.DataField', Label : 'Approved At', Value : approvedAt }
        ]
    }
);


annotate service.PurchaseOrder with {
    vendor @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Vendor',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : vendor_ID,
                ValueListProperty : 'ID'
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'name'
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'country'
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'rating'
            }
        ]
    }
};
