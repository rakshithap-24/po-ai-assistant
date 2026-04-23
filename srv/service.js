const cds = require('@sap/cds')

module.exports = cds.service.impl(async function () {
  const { PurchaseOrders } = this.entities

  this.before('CREATE', 'PurchaseOrders', async (req) => {
    if (!req.data.status) {
      req.data.status = 'Draft'
    }

    if (req.data.amount <= 0) {
      req.error(400, 'Amount must be greater than 0')
    }
  })

  this.on('ApprovePO', async (req) => {
    const { ID } = req.data
    const tx = cds.tx(req)

    const po = await tx.read(PurchaseOrders).where({ ID })

    if (!po.length) {
      req.error(404, 'Purchase Order not found')
    }

    await tx.update(PurchaseOrders)
      .set({ status: 'Approved' })
      .where({ ID })

    return `PO ${ID} approved successfully`
  })

  this.on('GeneratePOInsight', async (req) => {
    const { ID } = req.data
    return `AI insight placeholder for PO ${ID}`
  })
})