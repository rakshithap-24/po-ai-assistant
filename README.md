# 🚀 AI-Powered Purchase Order Assistant

**SAP CAP • SAP HANA Cloud • OData V4 • SAP Fiori Elements • Generative AI**

---

## 📌 Overview

The **AI-Powered Purchase Order Assistant** is a production-style SAP CAP application that simulates an enterprise Purchase Order review and approval process.

The application allows business users to manage purchase orders, approve or reject them, and generate AI-driven purchase order risk insights directly from a SAP Fiori UI.

The project demonstrates how SAP CAP, SAP HANA Cloud, OData V4, SAP Fiori Elements, and Generative AI can be combined to build an intelligent enterprise application.

---

## 🎯 Business Use Case

In enterprise procurement systems, purchase orders often require review before approval. Manual review can be time-consuming, especially when approvers need to evaluate vendor risk, purchase amount, description, and current approval status.

This application helps by:

- Displaying purchase orders in a SAP Fiori List Report
- Allowing users to approve or reject purchase orders
- Generating AI-based risk insights for selected purchase orders
- Persisting AI recommendations and risk details in SAP HANA Cloud
- Refreshing the Fiori table automatically after backend actions

---

## 🧩 Key Features

### Purchase Order Management

- View purchase orders from SAP HANA Cloud
- Filter purchase orders by PO number, vendor, status, and currency
- Display PO amount, currency, status, vendor, and AI risk fields
- Delete purchase orders from the Fiori UI

### Approval Workflow

- Approve purchase orders using a CAP bound action
- Reject purchase orders using a CAP bound action
- Prevent invalid approval and rejection flows
- Store approval metadata such as approver and approval timestamp

### AI Insight Generation

The app includes a custom CAP bound action:

```text
generatePOInsight
