# AI-Powered Purchase Order Assistant

A full-stack SAP BTP application that combines **SAP CAP**, **SAP HANA Cloud**, **SAP Fiori/UI5**, **OData V4**, **live procurement data**, and **Generative AI** to support intelligent purchase order review, risk analysis, analytics, and approval decisions.

---

## Project Overview

The **AI-Powered Purchase Order Assistant** is an enterprise-style procurement application built using SAP technologies. It helps business users review purchase orders, understand procurement risk, generate AI-driven recommendations, and approve or reject purchase orders through a user-friendly SAP Fiori interface.

The application opens with an **Analytics Dashboard**, loads a controlled live procurement dataset into **SAP HANA Cloud**, visualizes procurement KPIs, and allows users to navigate into the Purchase Orders page for operational actions.

---

## Business Use Case

Procurement teams often review large volumes of purchase orders manually. Reviewers usually need to analyze:

- Vendor details
- Purchase order amount
- Procurement description
- Current approval status
- Risk level
- AI recommendation
- Business justification
- Approval/rejection history

Manual review becomes difficult when purchase order volume increases. This project solves that by combining **live procurement data**, **SAP HANA persistence**, **dashboard analytics**, and **AI-generated risk insights** in one SAP application.

---

## Key Features

### 1. Dashboard-First User Experience

The application opens directly with the Analytics Dashboard.

The dashboard gives users a quick business overview before they go into detailed purchase order processing.

Dashboard highlights:

- Total purchase orders
- Total procurement spend
- High-risk purchase orders
- Pending approvals
- AI-pending reviews
- Live import status
- Risk distribution chart
- Approval status chart
- Top vendors by spend
- AI recommendation breakdown
- High-risk purchase order overview

---

### 2. Controlled Live Dataset Loading

The application integrates with live procurement-style data from **USAspending.gov**.

When the dashboard opens, the backend checks whether SAP HANA Cloud already contains the required dataset. If the database has fewer than the configured target number of records, the backend loads additional records in controlled batches.

Current dataset behavior:

- Loads procurement records from an external API
- Stores data in SAP HANA Cloud
- Prevents duplicate records using `externalAwardId`
- Tracks import progress using `LiveImportState`
- Loads up to a controlled maximum dataset size, such as 2,000 records
- Avoids repeated imports during normal navigation
- Dashboard and Purchase Orders pages read from SAP HANA Cloud

This provides a realistic enterprise-style data sync process without overloading the SAP trial environment.

---

### 3. SAP Fiori Purchase Order List

The Purchase Orders page is built using SAP Fiori Elements List Report.

Users can:

- View all persisted purchase orders from SAP HANA Cloud
- Search purchase orders
- Filter by purchase order number, vendor, status, and currency
- View amount, currency, status, risk level, AI recommendation, and AI reason
- Navigate to purchase order detail pages
- Generate AI insights
- Approve purchase orders
- Reject purchase orders
- Return to the Analytics Dashboard

---

### 4. AI-Generated Purchase Order Risk Insights

The application includes a custom CAP bound action:

```text
generatePOInsight
