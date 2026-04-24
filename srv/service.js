const cds = require('@sap/cds')

module.exports = cds.service.impl(async function () {
  const { PurchaseOrder } = this.entities

  this.before('CREATE', 'PurchaseOrder', async (req) => {
    if (!req.data.status) req.data.status = 'Draft'
    if (req.data.amount <= 0) req.error(400, 'Amount must be greater than 0')
  })

  this.on('approvePO', async (req) => {
    const { ID } = req.data
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

  this.on('rejectPO', async (req) => {
    const { ID } = req.data
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

  this.on('generatePOInsight', async (req) => {
    const { ID } = req.data
    const tx = cds.tx(req)

    const po = await tx.read(PurchaseOrder).where({ ID })
    if (!po.length) req.error(404, 'Purchase Order not found')

    const currentPO = po[0]

    let summary = ''
    let recommendation = ''

    if (currentPO.amount > 2000) {
      summary = 'High-value purchase order requiring additional review.'
      recommendation = 'Recommended for manager review before approval.'
    } else {
      summary = 'Standard purchase order with low financial risk.'
      recommendation = 'Can proceed through normal approval flow.'
    }

    await tx.update(PurchaseOrder).set({
      riskSummary: summary,
      aiRecommendation: recommendation
    }).where({ ID })

    return summary
  })
})