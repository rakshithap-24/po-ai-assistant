````md
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
```

This action sends selected purchase order information to an AI model through an OpenRouter-based LLM proxy and receives structured business insight.

AI-generated fields include:

- Risk Summary
- AI Recommendation
- AI Reason
- Risk Level
- AI Generated Timestamp

Supported AI recommendation values:

```text
Approve
Review
Reject
```

Supported risk levels:

```text
Low
Medium
High
```

The AI-generated result is stored in SAP HANA Cloud and displayed in the SAP Fiori UI.

---

### 5. Purchase Order Approval Workflow

The app supports realistic approval and rejection logic using SAP CAP bound actions.

Available actions:

```text
approvePO
rejectPO
```

Approval rules:

- Pending purchase orders can be approved.
- Already approved purchase orders cannot be approved again.
- Rejected purchase orders cannot be approved.
- Purchase orders with AI recommendation `Reject` are blocked from approval.
- Approval user and approval timestamp are stored.

Rejection rules:

- Pending purchase orders can be rejected.
- Approved purchase orders cannot be rejected.
- Already rejected purchase orders cannot be rejected again.

This adds backend validation similar to enterprise workflow systems.

---

## Application Flow

```text
User opens application
        ↓
Analytics Dashboard loads first
        ↓
Backend checks SAP HANA Cloud dataset
        ↓
If fewer than target records exist, backend loads controlled live data
        ↓
Dashboard displays KPI cards and charts
        ↓
User clicks View Purchase Orders
        ↓
SAP Fiori Purchase Order List opens
        ↓
User selects a purchase order
        ↓
User generates AI insights
        ↓
User approves or rejects the purchase order
        ↓
Dashboard can be refreshed to view updated analytics
```

---

## Architecture

```text
┌─────────────────────────────────────────────┐
│              SAP Fiori / SAPUI5             │
│  Analytics Dashboard + Purchase Order List   │
└───────────────────────┬─────────────────────┘
                        │
                        │ OData V4
                        │
┌───────────────────────▼─────────────────────┐
│                SAP CAP Service               │
│  POService                                   │
│  - Vendor projection                         │
│  - PurchaseOrder projection                  │
│  - LiveImportState projection                │
│  - Analytics endpoints                       │
│  - Approve / Reject actions                  │
│  - AI insight action                         │
│  - Controlled dataset loading action         │
└───────────────────────┬─────────────────────┘
                        │
        ┌───────────────┼─────────────────┐
        │               │                 │
┌───────▼───────┐ ┌─────▼──────┐ ┌────────▼─────────┐
│ SAP HANA Cloud│ │ OpenRouter │ │ USAspending.gov  │
│ Persistence   │ │ LLM API    │ │ External API     │
└───────────────┘ └────────────┘ └──────────────────┘
```

---

## Technology Stack

| Area | Technology |
|---|---|
| Backend | SAP CAP, Node.js |
| Database | SAP HANA Cloud, HDI Container |
| Service Layer | OData V4 |
| UI Framework | SAP Fiori Elements, SAPUI5 |
| Dashboard | SAPUI5 XML View, KPI Tiles, VizFrame Charts |
| AI Integration | OpenRouter / LLM Proxy |
| External Data | USAspending.gov API |
| Development Environment | SAP Business Application Studio |
| Deployment Configuration | MTA |
| Version Control | Git, GitHub |

---

## Project Structure

```text
po-ai-assistant/
│
├── app/
│   └── purchaseorderui/
│       ├── annotations.cds
│       └── webapp/
│           ├── index.html
│           ├── manifest.json
│           ├── css/
│           │   └── analytics.css
│           └── ext/
│               ├── controller/
│               │   ├── AnalyticsDashboard.controller.js
│               │   └── ListReportExt.js
│               └── view/
│                   └── AnalyticsDashboard.view.xml
│
├── db/
│   └── schema.cds
│
├── srv/
│   ├── service.cds
│   ├── service.js
│   ├── ai/
│   │   └── llmProxy.js
│   └── external/
│       └── usaspendingService.js
│
├── mta.yaml
├── package.json
├── README.md
└── .gitignore
```

---

## Main Data Model

### Vendor

```cds
entity Vendor {
    key ID      : UUID;
        name    : String(100);
        country : String(50);
        rating  : Integer;
}
```

### PurchaseOrder

```cds
entity PurchaseOrder : managed {
    key ID               : UUID;

        poNumber         : String(30);
        description      : String(500);
        amount           : Decimal(15,2);
        currency         : String(5);
        status           : String(30);

        externalAwardId  : String(120);
        externalSource   : String(100);
        importedAt       : Timestamp;

        riskSummary      : String(1000);
        aiRecommendation : String(1000);
        aiReason         : String(1000);
        riskLevel        : String(20);
        aiGeneratedAt    : Timestamp;

        approvedBy       : String(100);
        approvedAt       : Timestamp;

        vendor           : Association to Vendor;
}
```

### LiveImportState

```cds
entity LiveImportState : managed {
    key ID        : String(50);
        source    : String(100);
        lastPage  : Integer;
        lastLimit : Integer;
        lastRunAt : Timestamp;
}
```

---

## Main CAP Service

The main service is exposed as:

```text
/odata/v4/po/
```

Main entities:

```text
Vendor
PurchaseOrder
LiveImportState
AnalyticsSummary
RiskDistribution
StatusDistribution
VendorSpendAnalytics
RecommendationDistribution
RecentHighRiskPO
LiveImportOverview
```

---

## Main CAP Actions

| Action | Type | Purpose |
|---|---|---|
| `approvePO` | Bound action | Approves selected purchase order |
| `rejectPO` | Bound action | Rejects selected purchase order |
| `generatePOInsight` | Bound action | Generates AI risk insight for selected purchase order |
| `importLiveProcurementData` | Unbound action | Imports a live procurement batch |
| `ensureProcurementDatasetLoaded` | Unbound action | Ensures the HANA dataset is loaded up to the configured limit |

---

## Analytics Endpoints

The dashboard uses CAP analytics endpoints to aggregate SAP HANA data.

```text
/odata/v4/po/AnalyticsSummary
/odata/v4/po/RiskDistribution
/odata/v4/po/StatusDistribution
/odata/v4/po/VendorSpendAnalytics
/odata/v4/po/RecommendationDistribution
/odata/v4/po/RecentHighRiskPO
/odata/v4/po/LiveImportOverview
```

These endpoints power:

- KPI cards
- Donut charts
- Bar charts
- Vendor spend analysis
- Approval status analysis
- AI recommendation analysis
- Live import status

---

## Dashboard Features

The custom SAPUI5 dashboard includes:

### KPI Cards

```text
Total POs
Total Spend
High Risk
Pending
AI Pending
```

### Charts

```text
Risk Distribution
Approval Status
Top Vendors by Spend
AI Recommendation Breakdown
```

### Navigation

```text
Dashboard → View Purchase Orders
Purchase Orders → Analytics Dashboard
```

The dashboard is the default landing page of the application.

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/rakshithap-24/po-ai-assistant.git
cd po-ai-assistant
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=anthropic/claude-haiku-4.5
```

Do not commit `.env`.

Make sure `.gitignore` contains:

```text
.env
.cdsrc-private.json
default-env.json
node_modules/
gen/
```

### 4. Build the CAP project

```bash
cds build
```

### 5. Deploy database artifacts to SAP HANA Cloud

Run this if database entities were added or changed:

```bash
cds deploy --to hana
```

### 6. Start the app in hybrid mode

```bash
cds watch --profile hybrid
```

---

## Running the Application

After the server starts, open:

```text
http://localhost:4004/purchaseorderui/webapp
```

The application opens with the Analytics Dashboard.

From the dashboard, click:

```text
View Purchase Orders
```

to open the Purchase Orders page.

---

## Testing with cURL

### Check Purchase Orders

```bash
curl http://localhost:4004/odata/v4/po/PurchaseOrder
```

### Ensure controlled dataset is loaded

```bash
curl -X POST http://localhost:4004/odata/v4/po/ensureProcurementDatasetLoaded \
  -H "Content-Type: application/json" \
  -d '{"targetLimit":2000,"batchSize":100}'
```

### Import next live procurement batch

```bash
curl -X POST http://localhost:4004/odata/v4/po/importLiveProcurementData \
  -H "Content-Type: application/json" \
  -d '{"limit":50}'
```

### Check Analytics Summary

```bash
curl http://localhost:4004/odata/v4/po/AnalyticsSummary
```

### Check Risk Distribution

```bash
curl http://localhost:4004/odata/v4/po/RiskDistribution
```

---

## Demo Flow

Use this flow while presenting the project:

1. Open the application.
2. Show that the Analytics Dashboard opens first.
3. Explain KPI cards:
   - Total POs
   - Total Spend
   - High Risk
   - Pending
   - AI Pending
4. Explain charts:
   - Risk Distribution
   - Approval Status
   - Top Vendors by Spend
   - AI Recommendation Breakdown
5. Click **View Purchase Orders**.
6. Select a pending purchase order.
7. Click **Generate AI Insights**.
8. Show the AI-generated:
   - Risk Summary
   - AI Recommendation
   - AI Reason
   - Risk Level
9. Approve or reject the purchase order.
10. Return to the Analytics Dashboard and refresh the analytics.

---

## Screenshots

Create this folder:

```text
docs/screenshots/
```

Recommended screenshots:

```text
docs/screenshots/analytics-dashboard.png
docs/screenshots/purchase-order-list.png
docs/screenshots/ai-insight-generated.png
docs/screenshots/object-page-details.png
docs/screenshots/hana-imported-data.png
```

Then add screenshots like this:

### Analytics Dashboard

![Analytics Dashboard](docs/screenshots/analytics-dashboard.png)

### Purchase Order List

![Purchase Order List](docs/screenshots/purchase-order-list.png)

### AI Insight Generation

![AI Insight Generation](docs/screenshots/ai-insight-generated.png)

### Object Page Details

![Object Page Details](docs/screenshots/object-page-details.png)

---

## Business Value

This project demonstrates how procurement teams can use SAP and AI to:

- Reduce manual purchase order review effort
- Identify high-risk purchase orders quickly
- Improve approval decision consistency
- Centralize live procurement data in SAP HANA Cloud
- Provide real-time procurement visibility through dashboards
- Combine operational workflow with analytics and AI insights
- Support business users with clear recommendations and explanations

---

## Technical Highlights

- SAP CAP domain modeling using CDS
- SAP HANA Cloud persistence
- OData V4 service exposure
- SAP Fiori Elements List Report and Object Page
- Custom SAPUI5 analytics dashboard
- SAPUI5 VizFrame chart integration
- Controlled external API data loading
- HANA-backed import state tracking
- Duplicate prevention using external award IDs
- AI-generated structured JSON insights
- Backend validation for approve/reject actions
- Dashboard-first application experience
- Git-based version control

---

## Current Limitations

This is a portfolio/demo application and not a production procurement system.

Known limitations:

- Authentication and authorization are not fully production-hardened.
- XSUAA role-based authorization can be added later.
- Dataset loading is capped for SAP trial account performance.
- AI output depends on the selected LLM model and prompt quality.
- External API availability may affect live data loading.
- Large-scale production sync should be implemented using scheduled jobs or SAP Integration Suite.

---

## Future Enhancements

Potential improvements:

- Add XSUAA role-based access control
- Add Manager/Admin/User authorization
- Add approval history table
- Add audit logging
- Add SAP Build Work Zone launch integration
- Add SAP Integration Suite-based scheduled data sync
- Add GitHub Actions CI/CD pipeline
- Add vendor risk scoring
- Add advanced AI risk scoring model
- Add export to Excel/PDF
- Add notification workflow
- Add SAP Build Process Automation approval flow

---

## Project Status

```text
SAP CAP backend: Complete
SAP HANA Cloud persistence: Complete
Fiori Purchase Order List: Complete
Object Page navigation: Complete
Analytics Dashboard: Complete
Live procurement data loading: Complete
AI risk insight workflow: Complete
Approve/Reject workflow: Complete
Dashboard-first navigation: Complete
Portfolio README/screenshots: In progress
```

---

## Author

**Rakshitha Prakash**

Project: AI-Powered Purchase Order Assistant  
Focus: SAP BTP, SAP CAP, SAP HANA Cloud, SAP Fiori/UI5, OData V4, AI-assisted procurement analytics

---

## Repository

```text
https://github.com/rakshithap-24/po-ai-assistant
```
````

After saving it:

```bash
git status
git add README.md
git commit -m "Update README with complete project documentation"
git pull --rebase origin main
git push origin main
```
