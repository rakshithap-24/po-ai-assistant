sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"po/assistant/purchaseorderui/test/integration/pages/PurchaseOrderList",
	"po/assistant/purchaseorderui/test/integration/pages/PurchaseOrderObjectPage"
], function (JourneyRunner, PurchaseOrderList, PurchaseOrderObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('po/assistant/purchaseorderui') + '/test/flp.html#app-preview',
        pages: {
			onThePurchaseOrderList: PurchaseOrderList,
			onThePurchaseOrderObjectPage: PurchaseOrderObjectPage
        },
        async: true
    });

    return runner;
});

