using POService as service from '../../srv/service';

annotate service.PurchaseOrder with @(
    UI.HeaderInfo                 : {
        TypeName      : 'Purchase Order',
        TypeNamePlural: 'Purchase Orders',
        Title         : {Value: poNumber},
        Description   : {Value: description}
    },

    UI.SelectionFields            : [
        poNumber,
        vendor_ID,
        status,
        currency
    ],

  UI.LineItem : [
    {
        $Type : 'UI.DataField',
        Label : 'PO Number',
        Value : poNumber,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '8%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'Vendor',
        Value : vendor.name,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '12%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'Description',
        Value : description,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '17%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'Amount',
        Value : amount,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '8%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'Currency',
        Value : currency,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '6%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'Status',
        Value : status,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '8%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'Risk Level',
        Value : riskLevel,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '7%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'AI Recommendation',
        Value : aiRecommendation,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '10%' }
    },
    {
        $Type : 'UI.DataField',
        Label : 'AI Reason',
        Value : aiReason,
        ![@com.sap.vocabularies.HTML5.v1.CssDefaults] : { width : '24%' }
    },

    {
        $Type : 'UI.DataFieldForAction',
        Label : 'Approve',
        Action : 'POService.approvePO'
    },
    {
        $Type : 'UI.DataFieldForAction',
        Label : 'Reject',
        Action : 'POService.rejectPO'
    },
    {
        $Type : 'UI.DataFieldForAction',
        Label : 'Generate AI Insights',
        Action : 'POService.generatePOInsight'
    }
],


    UI.Facets                     : [
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Purchase Order Details',
            Target: '@UI.FieldGroup#PODetails'
        },
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'AI Insights',
            Target: '@UI.FieldGroup#AIInsights'
        },
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'Approval Details',
            Target: '@UI.FieldGroup#ApprovalDetails'
        }
    ],

    UI.FieldGroup #PODetails      : {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'PO Number',
                Value: poNumber
            },
            {
                $Type: 'UI.DataField',
                Label: 'Vendor',
                Value: vendor.name
            },
            {
                $Type: 'UI.DataField',
                Label: 'Description',
                Value: description
            },
            {
                $Type: 'UI.DataField',
                Label: 'Amount',
                Value: amount
            },
            {
                $Type: 'UI.DataField',
                Label: 'Currency',
                Value: currency
            },
            {
                $Type: 'UI.DataField',
                Label: 'Status',
                Value: status
            }
        ]
    },

    UI.FieldGroup #AIInsights     : {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'Risk Level',
                Value: riskLevel
            },
            {
                $Type: 'UI.DataField',
                Label: 'AI Recommendation',
                Value: aiRecommendation
            },
            {
                $Type: 'UI.DataField',
                Label: 'Risk Summary',
                Value: riskSummary
            },
            {
                $Type: 'UI.DataField',
                Label: 'AI Reason',
                Value: aiReason
            },
            {
                $Type: 'UI.DataField',
                Label: 'AI Generated At',
                Value: aiGeneratedAt
            }
        ]
    },

    UI.FieldGroup #ApprovalDetails: {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'Approved By',
                Value: approvedBy
            },
            {
                $Type: 'UI.DataField',
                Label: 'Approved At',
                Value: approvedAt
            }
        ]
    }
);
annotate service.PurchaseOrder with {
    description @UI.MultiLineText;
    riskSummary @UI.MultiLineText;
    aiReason @UI.MultiLineText;
};

annotate service.PurchaseOrder with {
    vendor @Common.ValueList: {
        $Type         : 'Common.ValueListType',
        CollectionPath: 'Vendor',
        Parameters    : [
            {
                $Type            : 'Common.ValueListParameterInOut',
                LocalDataProperty: vendor_ID,
                ValueListProperty: 'ID'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'name'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'country'
            },
            {
                $Type            : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty: 'rating'
            }
        ]
    }
};
