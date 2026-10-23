# 🚀 AI-Powered Purchase Order Assistant  
### SAP CAP • SAP HANA Cloud • OData V4

---

## 📌 Overview
This project is a **production-style backend application** built using **SAP Cloud Application Programming Model (CAP)** and **SAP HANA Cloud**.

It simulates a **Purchase Order Management System** with:
- Approval workflows  
- Business validations  
- Extensible architecture for AI-driven insights  

---

## Advanced Capabilities

- **Policy-driven approval:** Match enabled policies by amount, currency, department, and risk level. Policies can require multiple approval stages, AI review, and contract references, or block high-risk orders.
- **Sequential review queue:** Submit eligible orders into staged approval tasks. Each approval advances one stage; rejection closes the workflow.
- **Audit history:** Record order creation, policy blocks, submissions, approval stages, final decisions, AI generation, and human AI overrides with actor and timestamp.
- **Human-governed AI:** Store bounded confidence and structured evidence with AI risk assessments. Approvers can override the recommendation and risk level only with a reason.
- **Procurement checks:** Block restricted vendors and budget overruns. Warn on elevated vendor risk and possible matching orders.
- **Spend anomaly dashboard:** Surface budget overruns, restricted or elevated-risk vendors, duplicate candidates, and large orders relative to a vendor's median spend.
- **Role boundaries:** XSUAA roles separate read access, approval actions, and administration. Purchase-order status transitions must use workflow actions.
- **Deployment packaging:** The MTA build produces the CAP/HANA deployment and UI5 resources for the authenticated approuter.

## Build and Test

Install dependencies, then run:

```sh
npm test
npm run build
```

The production build runs `cds build --production` and packages the UI5 application into `approuter/resources`. Configure XSUAA role collections for `PurchaseOrderUser`, `PurchaseOrderApprover`, and `PurchaseOrderAdministrator` in the target BTP subaccount. Set `OPENROUTER_API_KEY` as a secure application environment variable to enable AI review; do not commit secrets.

## Integration Boundaries

This version does not send email or Teams notifications and does not connect to an ERP, contract repository, or document storage. Those integrations require target-system credentials, service bindings, and agreed data contracts. USAspending awards are external public award records and should not be represented as internally originated purchase orders without an ERP/procurement-system integration.

Approval policies are managed through the protected OData `ApprovalPolicy` entity by administrators. The approval queue and audit event entities are exposed to approvers. Notification delivery, delegation, and policy administration UI are not included yet.
