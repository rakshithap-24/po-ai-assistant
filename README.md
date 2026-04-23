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

## 🏗️ Architecture

```mermaid
graph TD
    Client[API Client / UI] -->|OData V4| CAP[CAP Service Layer]
    CAP -->|Business Logic| DB[(SAP HANA Cloud - HDI)]
    CAP -->|Future| AI[Generative AI Service]

🧱 Tech Stack
| Layer           | Technology                      |
| --------------- | ------------------------------- |
| Backend         | SAP CAP (Node.js, CDS)          |
| Database        | SAP HANA Cloud (HDI Container)  |
| API             | OData V4                        |
| Dev Environment | SAP Business Application Studio |
| Version Control | Git & GitHub                    |

