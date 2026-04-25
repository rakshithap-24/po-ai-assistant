sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'po.assistant.purchaseorderui',
            componentId: 'PurchaseOrderObjectPage',
            contextPath: '/PurchaseOrder'
        },
        CustomPageDefinitions
    );
});