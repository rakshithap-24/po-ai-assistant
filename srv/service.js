const cds = require('@sap/cds')

module.exports = cds.service.impl(async function () {
  const { PurchaseOrder } = this.entities

  this.before('CREATE', 'PurchaseOrder', async (req) => {
    if (!req.data.status) req.data.status = 'Draft'
    if (req.data.amount <= 0) req.error(400, 'Amount must be greater than 0')
  })

  this.on('approvePO','PurchaseOrder', async (req) => {
    console.log('Approve action triggered');
    const ID = req.params[0].ID;
    const tx = cds.tx(req)

    const po = await tx.read(PurchaseOrder).where({ ID })
    if (!po.length) req.error(404, 'Purchase Order not found')

    const currentPO = po[0]

    if (currentPO.status === 'Approved') {
      req.error(400, 'Purchase Order is already approved')
    }

    if (currentPO.status === 'Rejected') {
      req.error(400, 'Rejected Purchase Order cannot be approved')
    }

    await tx.update(PurchaseOrder)
      .set({
        status: 'Approved',
        approvedBy: req.user.id || 'System',
        approvedAt: new Date()
      })
      .where({ ID })

    return `PO ${ID} approved successfully`
  })

  this.on('rejectPO','PurchaseOrder', async (req) => {
    const ID = req.params[0].ID;
    const tx = cds.tx(req)

    const po = await tx.read(PurchaseOrder).where({ ID })
    if (!po.length) req.error(404, 'Purchase Order not found')

    const currentPO = po[0]

    if (currentPO.status === 'Rejected') {
      req.error(400, 'Purchase Order is already rejected')
    }

    if (currentPO.status === 'Approved') {
      req.error(400, 'Approved Purchase Order cannot be rejected')
    }

    await tx.update(PurchaseOrder)
      .set({
        status: 'Rejected'
      })
      .where({ ID })

    return `PO ${ID} rejected successfully`
  })

  this.on('generatePOInsight','PurchaseOrder', async (req) => {
    const ID = req.params[0].ID;
    const tx = cds.tx(req)

    const po = await tx.read(PurchaseOrder).where({ ID })
    if (!po.length) req.error(404, 'Purchase Order not found')

    const riskSummary = `PO ${po.poNumber} has amount ${po.amount} ${po.currency}. Current status is ${po.status}.`;
    const aiRecommendation = po.amount > 10000
        ? 'High-value purchase order. Manual review is recommended before approval.'
        : 'Purchase order amount is within normal range. Approval can proceed if vendor details are valid.';

    await UPDATE('sap.cap.poi.PurchaseOrder')
        .set({
            riskSummary,
            aiRecommendation
        })
        .where({ ID });

    return 'AI insight generated successfully';
  })
})