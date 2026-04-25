using POService as service from '../../srv/service';
annotate service.PurchaseOrder with @(
    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'poNumber',
                Value : poNumber,
            },
            {
                $Type : 'UI.DataField',
                Label : 'description',
                Value : description,
            },
            {
                $Type : 'UI.DataField',
                Label : 'amount',
                Value : amount,
            },
            {
                $Type : 'UI.DataField',
                Label : 'currency',
                Value : currency,
            },
            {
                $Type : 'UI.DataField',
                Label : 'status',
                Value : status,
            },
            {
                $Type : 'UI.DataField',
                Label : 'riskSummary',
                Value : riskSummary,
            },
            {
                $Type : 'UI.DataField',
                Label : 'aiRecommendation',
                Value : aiRecommendation,
            },
            {
                $Type : 'UI.DataField',
                Label : 'approvedBy',
                Value : approvedBy,
            },
            {
                $Type : 'UI.DataField',
                Label : 'approvedAt',
                Value : approvedAt,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'PO Number',
            Value : poNumber,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Description',
            Value : description,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Amount',
            Value : amount,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Currency',
            Value : currency,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Status',
            Value : status,
        },
    ],
);

annotate service.PurchaseOrder with {
    vendor @Common.ValueList : {
        $Type : 'Common.ValueListType',
        CollectionPath : 'Vendor',
        Parameters : [
            {
                $Type : 'Common.ValueListParameterInOut',
                LocalDataProperty : vendor_ID,
                ValueListProperty : 'ID',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'name',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'country',
            },
            {
                $Type : 'Common.ValueListParameterDisplayOnly',
                ValueListProperty : 'rating',
            },
        ],
    }
};

