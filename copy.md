# Complyr Web Application Copy

## Global / App Shell
**Metadata**
- Title: "Complyr — Private Audit Infrastructure for Onchain Payments"
- Description: "Complyr attaches encrypted audit records to every onchain payment. Auditors verify payments against private audit tests without decrypting the data."

## Public Website (Landing Page)

**Navigation**
- Brand Name: "Complyr"
- Links: "Documentation", "GitHub", "Launch App"

**Hero Section**
- Headline: "Private audit infrastructure for onchain business payments."
- Subheadline: "Complyr is a payments system that attaches encrypted audit records to every payment. Auditors can verify payments against private audit tests without decrypting the data."
- Buttons: "Try the demo", "Read the docs"
- System Status: "SYSTEM_STATUS: OPERATIONAL"

**Problem Section**
- Eyebrow: "The gap nobody talks about"
- Headline: "Blockchain transactions lack the business context needed for credible audits."
- Body: "While the transfer itself is permanently recorded, the actual business context, like expense categories, jurisdictions, and references, remains scattered across emails and spreadsheets. For a business, this missing connection creates a weak audit trail."

**How It Works Section**
- Eyebrow: "The Solution"
- Headline: "A dual ledger for every payment."
- Status text: "DEMO_BUILD: ALFA"
- Steps:
  - 01 / SYSTEM TREASURY (Smart Vaults): "Deploy an audit-aware smart account onchain to act as your business's primary treasury."
  - 02 / SECURE METADATA (Encryption): "Attach required audit context to your payment. Zama FHE keeps private context and review thresholds encrypted on Ethereum Sepolia."
  - 03 / NATIVE EXECUTION (Settlement): "The payment settles natively onchain while encrypted audit records are permanently anchored in the same transaction."
  - 04 / VERIFIABLE PROOFS (Audit): "Approve specific auditors. They can create private threshold tests and decrypt only the resulting audit findings."

**Features Section**
- Eyebrow: "Built for real business operations"
- Headline: "Everything a corporate treasury needs. Nothing it doesn't."
- Features:
  - "Payroll & Subscriptions": "Automated, stateful recurring payments. Manage employee salaries and subscriptions securely on-chain."
  - "Batch Payouts": "Execute mass vendor payments in a single transaction. Highly scalable infrastructure designed to save gas."
  - "Single Transfers": "Fast, reliable direct B2B transactions. The foundational layer for moving treasury funds efficiently."
  - "Encrypted Audit Layer": "Zama FHE lets the contract run checks on private data without decrypting it. Auditors get answers, not access."
  - "Account Abstraction": "Seamless gasless transactions and simple Web2-style social logins for frictionless enterprise onboarding."
  - "External Audit Portal": "Give specific auditors a private portal. They set their own audit tests, the contract checks payments against those tests, and they decrypt only the outcome."

**Use Cases Section**
- Eyebrow: "Who is Complyr for?"
- Headline: "Any business that pays people on-chain needs a private audit layer."
- Subheadline: "From decentralized protocols to established fintech platforms moving to the public ledger."
- Cases:
  - "Web3 Native DAOs": "Automate contributor payouts while maintaining public accountability and private, auditable records."
  - "Global Payroll": "Streamline cross-border contractor payments with integrated, encrypted audit records."
  - "Onchain Treasury": "Manage corporate capital calls and distributions with institutional-grade audit readiness and metadata."
  - "Venture Capital & Grants": "Distribute funding to portfolio companies or grantees while maintaining strict, auditable privacy over exact allocation amounts."

**Technology Section**
- Eyebrow: "The stack"
- Tech Roles:
  - "Ethereum Sepolia" -> "Settlement"
  - "Chainlink" -> "Automation"
  - "Zama FHE" -> "Encryption"
  - "Envio" -> "Data Indexing"
  - "ERC-4337" -> "Account Abstraction"
  - "Automation" -> "Scheduled Execution"
- Protocol Schema: "AUDIT_PAYLOAD.JSON", "v0.2.0-beta"

**Final CTA Section**
- Headline: "Your business is already operating onchain. Your audit infrastructure should be too."
- Subheadline: "Complyr is live on Ethereum Sepolia. Encrypted audit records for the onchain economy."
- Buttons: "Try the demo", "Read the docs"

**Footer**
- Brand Headline: "Complyr"
- Description: "Private audit infrastructure for onchain business payments. Built for the future of institutional treasury."
- Eyebrow: "Built for Onchain Auditability"
- Categories: "Resources" (Demo, Docs, GitHub, Contracts), "Powered By" (ETHEREUM SEPOLIA, ZAMA FHE, ENVIO)
- Copyright text: "© 2026 COMPLYR INFRASTRUCTURE. ENCRYPTED COMPUTATION. IMMUTABLE AUDIT RECORDS. ONCHAIN SETTLEMENT."

## Authentication & Onboarding

**Login Page**
- Title: "Welcome back"
- Description: "Complyr uses your wallet to sign transactions and attach encrypted audit records to every payment. No account or password needed."
- Connect Button Text: "Connect Wallet"
- Error States: "Wrong network — switch"
- Features List: 
  - "FHE-encrypted audit trail on every payment"
  - "Self-custodial smart wallet — no shared keys"
  - "Payments cannot be recorded without your signature"

**Wrong Network Page**
- Title: "Wrong network"
- Description: "Complyr runs on the Sepolia testnet. Please switch your wallet to continue."
- Button: "Switching…" / "Switch to Sepolia"

**Account Deactivated Page**
- Title: "Account deactivated"
- Description: "Your business account has been deactivated by the Complyr protocol admin. Your deployed contracts and data are unchanged and remain under your wallet's ownership."
- Button: "Contact support"

**Onboarding - Step 1: Deploy Registry**
- Initial Title: "Deploy your account"
- Pending Title: "Waiting for signature…"
- Confirming Title: "Confirming on Sepolia…"
- Success Title: "Account deployed"
- Description (Idle): "Complyr deploys an isolated AuditRegistry and ReviewTestRegistry clone pair for your business. Ownership is transferred to you immediately — Complyr has zero admin rights after this transaction."
- Description (Success): "Your Complyr smart registry is live on Sepolia. Setting up authorization rules…"
- Checklist:
  - "AuditRegistry — encrypted payment records + findings"
  - "ReviewTestRegistry — automated audit test engine"
  - "Ownership transferred to your wallet — Complyr has zero admin rights"
- Button Loading States: "Deploying…", "Waiting for MetaMask…", "Confirming…"
- Buttons: "Retry", "Deploy Account"
- Bottom Hint: "Registering {wallet} on Sepolia"
- Error Messages: "This wallet is already registered. Refreshing…", "Transaction failed. Please retry."

**Onboarding - Step 2: Initialize Defaults**
- Title: "Account deployed"
- Description: "Your smart registry is live! We will now initialize it with default authorization thresholds for your delegation of authority rules."
- Tiers Box: 
  - "Manager Tier" / "> $500"
  - "Director Tier" / "> $1,500"
  - "Board Tier" / "> $3,000"
- Info Text: "You can change these thresholds and assign approver tiers later in the Settings page. Note: You must also add your external auditors in the Auditor page. Without adding auditors, your payments will not be monitored."
- Button Loading States: "Encrypting defaults…", "Waiting for MetaMask…", "Confirming on Sepolia…", "Initialized ✓"
- Button: "Initialize Account"
- Error Messages: "Encryption failed. Please retry."

## Dashboard Shell & Navigation

**Sidebar**
- Items:
  - "Payments" - "Send and manage onchain payments."
  - "Audits" - "Review encrypted audit records."
  - "Transactions" - "View your transaction history."
  - "Settings" - "Manage business registry and approvers."
- Empty State (Transactions):
  - Title: "No transactions yet"
  - Description: "Your onchain transaction history will appear here after your first payment."

## Dashboard / Payments

**Payment Form - Single Payment Tab**
- Section Title: "Transfer Details"
- Description: "Enter the recipient address and amount to transfer."
- Inputs: "Recipient Address", "Amount"
- Balance Info: "Available Balance: {amount} USDC"
- Audit Configuration Section:
  - Title: "Audit Configuration"
  - Description: "Securely attach GL categories and evidence to the transaction onchain."
  - Inputs: "GL Category (Encrypted)", "Invoice (Optional)", "Purchase Order (Optional)"
  - Info Text: "GL categories are FHE-encrypted before leaving your browser. Files are hashed locally (keccak256) — the raw file is never uploaded."

**Payment Form - Batch Payment Tab**
- Section Title: "Batch Transfer"
- Description: "Send multiple transactions efficiently in a single batch."
- Button: "Add Empty Row"
- Validation Error: "Batch payments require at least 2 recipients", "Amount must be greater than 0", "GL Category is required"

**Workflow Settings & Submit**
- Section Title: "Workflow Settings"
- Description: "Configure approval rules for this transaction."
- Option: "Require Second Approver" - "Flags this payment for Segregation of Duties. The approver must be a different address."
- Submit Info Text: "Please review all details before confirming.", "Encrypting data locally..."
- Button States: "Encrypting Category...", "Processing...", "Payment Successful ✓", "Confirm Payment"

**Mint Tokens Page (Dev Only)**
- Title: "Mint Dev Tokens"
- Description: "Mint 10,000 cUSDC to your connected wallet (Deployer Only)."
- Button: "Mint 10,000 cUSDC"
- Loading States: "Initializing Zama FHE...", "Encrypting 10,000 cUSDC...", "Confirm transaction in your wallet...", "Transaction submitted!"
- Error Toast: "Please connect your wallet first", "Minting failed"
- Success Toast: "Mint transaction submitted!"

## Dashboard / Audits

**Audit Overview**
- Title: "Auditor Management"
- Description: "Manage your external human auditors and configure their data access levels."
- Button: "Go to Auditor Portal"

**Auditor Management Form**
- Title: "Grant Access"
- Description: "Authorize a new auditor to review your encrypted records."
- Inputs: "Ethereum Address", "Access Tier" (Analytics, Full Access)
- Errors/Warnings: 
  - "Deploy and configure your AuditRegistry before managing auditors."
  - "Connected wallet is not the registry owner, so auditor permissions are read-only."
  - "Audit registry address is not available"
  - "Only the registry owner can grant auditor access"
  - "Invalid Ethereum address"
  - "Auditor already exists in roster"
  - "Maximum of 5 auditors allowed"
- Button: "Waiting for Signature...", "Confirming Access...", "Grant Access"
- Info Text: 
  - "Analytics: Can view encrypted GL category rollups, recipient totals, and audit findings."
  - "Full Access: Can read individual payment handles, run decryptions, and access evidence metadata."
- Roster Title: "Auditor Roster"
- Roster Description: "Manage external audit firms and their data access levels."
- Roster Slots: "{active} / 5 Slots Used"
- Empty States: "Loading auditors...", "No auditors have been granted access yet."
- Auditor Card Details: "Active Auditor", Badges ("Signal", "Analytics", "Full Access", "Revoked")
- Card Buttons: "History", "Revoke"
- Modals:
  - Grant Access: "Are you absolutely sure?", "This action will grant {tier} access to {address}. They will be able to see the data permitted under this tier.", "Grant Access", "Cancel"
  - Revoke Access: "Are you absolutely sure?", "This action will revoke all access for {address}. They will no longer be able to read any encrypted data or access analytics.", "Revoke Access", "Cancel"
  - Historical Access: "Grant Historical Access", "Grant {address} access to past payments. The registry currently has {count} recorded payments.", "All {count} payments", "Last {count} payments", "Granting access to large numbers of payments at once will consume more gas. Consider granting access in batches if the transaction fails."

**Audit Records / Audit List**
- Title: "Audit Records"
- Description: "Review encrypted audit records and transaction evidence."
- Search: "Search by address or TX..."
- Table Headers: "Transaction", "Date", "Recipient", "Amount (USDC)", "GL Category", "Evidence", "Status"
- Empty State: "No audit records yet", "Encrypted audit records will appear here after your first payment is confirmed onchain."
- Table States: "Decrypting...", "Encrypted", "Approved", "Pending"

**Findings Feed / Registry Status**
- Title: "Registry Status"
- Description: "Onchain configuration and deployed contract addresses."
- Info: "Audit Registry Contract", "View on Explorer"
- Status Items: "Delegation of Authority (Configured)", "Total Payments", "Total Findings"
- Feed Title: "Findings Feed"
- Feed Description: "Anomalies and rules triggered by the Review Test Registry."
- Empty State: "No findings detected", "All your onchain payments conform to the internal control policies."
- Table Headers: "Severity", "Test Type", "Payment ID", "Block"
- Severities: "Low", "Medium", "High", "Unknown"
- Footer Note: "Findings are permanently recorded onchain. They cannot be deleted by the business."

## Dashboard / Settings

**Approver Management**
- Inputs: "Approver Wallet Address"
- Errors: "Invalid Ethereum address.", "Encryption failed. Please retry."
- Buttons: "Authorize", "Revoke", "Set Tier"
- Status text: "Authorizing...", "Revoking...", "Encrypting...", "Setting Tier..."

## Auditor Portal 

**Auditor Shell (Access Checking)**
- Loading state: skeleton screen
- Errors:
  - "Access Denied"
  - "This business has not deployed a Complyr registry or it has been deactivated."
  - "You are not listed as an authorized auditor for this business. Please switch to an authorized wallet or ask the business owner for access."
- Buttons: "Switch Wallet / Disconnect"

**Analytics**
- Title: "Analytics"
- Description: "Encrypted rollup totals decrypted client-side. Values update as new payments are recorded."
- Section 1: "GL Category Totals"
- Section 2: "Recipient Concentration"
- Loading States: "Loading encrypted handles…", "Querying payment events…"
- Empty States: "No payments recorded yet."
- Values States: "Encrypted" (Lock icon), "—"

**Findings**
- Title: "Findings"
- Subtext (Zero): "Payment records that triggered one of your configured audit tests."
- Subtext (Active): "{count} finding(s) in your engagement."
- Empty State: "No findings yet", "When a payment triggers one of your tests, it will appear here."
- Filters: "All Test Types", "All Severities"
- Test Types: "Materiality", "Auth Breach", "Segregation of Duties", "Missing Evidence", "Category Concentration", "Recipient Concentration", "Structuring"
- Severities: "None", "Low", "Medium", "Critical"
- Table Headers: "Payment ID", "Test Type", "Severity", "Triggered By", "Block", "Decrypt"
- Buttons: "Decrypt", "No Access" (title: "Historical access not granted for this payment")
- Tooltips: "[shared]"

**Payments (In-scope)**
- Title: "Payments"
- Description (Zero): "Payments within your engagement scope. Only records you have been explicitly granted access to are shown."
- Description (Active): "{count} payment(s) in scope. Encrypted amounts can be decrypted on demand."
- Empty State: "No in-scope payments", "Ask the business owner to grant historical access, or wait for new payments to be recorded after your engagement started."
- Table Headers: "ID", "Sender", "Recipient", "Amount", "Status", "Evidence", "Block"
- Status Badges: "Approved", "Pending"
- Evidence Tags: "INV ✓", "INV —", "PO ✓", "PO —"
- Buttons: "Decrypt", loading spinner

**Test Configurator & Rules**
- Test Rules Title: "Test Suite"
- Test Rules Description: "Configure encrypted audit thresholds. Threshold values are FHE-encrypted before leaving your browser."
- Test Definitions:
  - "Materiality": "Flags any payment above the examination threshold. (Occurrence, Accuracy)"
  - "Authorization Breach": "Always active. Flags if the approver's authority tier was insufficient for the payment amount. (Authorization)"
  - "Segregation of Duties": "Always active. Flags if the same person initiated and approved a payment, or if the recipient approved their own payment. (Authorization)"
  - "Missing Evidence": "Flags payments above the threshold that lack a supporting invoice or document hash. (Occurrence)"
  - "Category Concentration": "Flags when cumulative spend in a specific GL category exceeds the threshold. (Classification)"
  - "Recipient Concentration": "Flags when cumulative spend to a single recipient exceeds the threshold. (Completeness)"
  - "Structuring": "Flags suspiciously split payments just below DoA thresholds. Launching in V2."
- Badges: "Coming Soon", "Always Active", "Configured & Active", "Inactive"
- Labels: "Priority", "Scope", "Every X payments", "Threshold encrypted"
- Configurator Modal Title: "Configure {Test Name}"
- Inputs: 
  - "Priority Level" (Monitoring (Periodic), Standard (Every Payment), Critical (High Severity))
  - "Monitoring Frequency" (Every {X} payments)
  - "GL Category Scope" - "Only payments in this category will be tested."
  - "Threshold (USD)" - "This value will be FHE encrypted before leaving your browser."
- Validation Errors: "Wallet not connected.", "Frequency must be greater than 0 for Monitoring priority."
- Buttons: "Cancel", "Save Configuration", "Encrypting…", "Confirming…", "Saving…"
