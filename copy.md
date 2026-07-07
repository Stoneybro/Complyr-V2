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
- Headline: "Confidential audit infrastructure for private on-chain payments."
- Subheadline: "Complyr lets external auditors run ISA-standard audits on private business payments without ever seeing the actual transactions. Built with Zama FHE and ERC-7984."
- Buttons: "Try the demo", "Read the docs"
- System Status: "SYSTEM_STATUS: OPERATIONAL"

**Problem Section**
- Eyebrow: "The Accountability Gap"
- Headline: "Private payments protect your business, but blind your auditors."
- Body: "Confidential tokens allow businesses to hide payment amounts, but this blinds external auditors. A business using private on-chain payments currently has to choose between handing over their decryption keys (destroying privacy) or asking auditors to just trust them."

**How It Works Section**
- Eyebrow: "The Solution"
- Headline: "A trustless, confidential audit layer."
- Status text: "DEMO_BUILD: ALFA"
- Steps:
  - 01 / ENCRYPTED CONTEXT: "FHE encrypts business context, like GL categories and invoice hashes, alongside the payment amount."
  - 02 / TRUSTLESS CALLBACK: "The token contract automatically triggers the audit infrastructure upon transfer, eliminating self-reporting fraud."
  - 03 / RUNTIME CIPHERTEXT EVALUATION: "The smart contract evaluates auditor thresholds against the encrypted payment data natively on-chain."
  - 04 / ISOLATED REVEAL: "Auditors only receive decrypted pass/fail results, with tiered access controls governing any further visibility."

**Features Section**
- Eyebrow: "Built for real-world auditing workflows"
- Headline: "Everything an auditor needs. Total privacy for the business."
- Features:
  - "Immutable Evidence Anchors": "Plaintext hashes of off-chain invoices and purchase orders are anchored to every transaction to prevent tampering."
  - "Tiered Access Controls": "Analytics-level auditors see encrypted rollups and metadata. Full-access auditors decrypt flagged transaction amounts scoped strictly to their engagement."
  - "Blind Category Rollups": "Complyr updates all General Ledger category buckets simultaneously using FHE.select, so storage diffs reveal nothing to chain observers."
  - "Encrypted Test Thresholds": "Auditors encrypt their test limits client-side. The business never knows the limits they are being tested against, preventing them from gaming the system."
  - "Trustless Callbacks": "Audit checks are embedded directly in the token transfer function. Businesses cannot skip the audit step or manipulate reported amounts."
  - "Isolated Audit Workspaces": "External auditors get a dedicated, read-only portal to view findings, track analytics, and execute authorized decryptions."

**Use Cases Section**
- Eyebrow: "Who is Complyr for?"
- Headline: "Bridging the gap between private transactions and accountability."
- Subheadline: "For organizations that must prove compliance without exposing their entire financial history."
- Cases:
  - "Startups & Investors": "Provide VCs and board members with cryptographically verified financial reports without exposing individual employee salaries or vendor contracts."
  - "Institutions & Grants": "Prove to government bodies or grant providers that funds were allocated exactly as mandated, backed by immutable on-chain evidence."
  - "Regulated Stablecoins": "Maintain ISA-standard compliance for private stablecoin transfers to satisfy traditional accounting and regulatory requirements."
  - "Web3 DAOs": "Automate contributor payouts while maintaining public accountability for the community and private, auditable records for the foundation."

**Technology Section**
- Eyebrow: "The stack"
- Tech Roles:
  - "Ethereum Sepolia" -> "Settlement & Smart Contracts"
  - "Zama FHE" -> "Encrypted State & Runtime Evaluation"
  - "Python / Gradio" -> "Event Relay & KMS Bridge"
- Protocol Schema: "AUDIT_PAYLOAD.JSON", "v0.2.0-beta"

**Final CTA Section**
- Headline: "Your business is already operating onchain. Your audit infrastructure should be too."
- Subheadline: "Complyr is live on Ethereum Sepolia. Encrypted audit records for the onchain economy."
- Buttons: "Try the demo", "Read the docs"

**Footer**
- Brand Headline: "Complyr"
- Description: "Private audit infrastructure for onchain business payments. Built for institutional accountability."
- Eyebrow: "Built for Onchain Auditability"
- Categories: "Resources" (Demo, Docs, GitHub, Contracts), "Powered By" (ETHEREUM SEPOLIA, ZAMA FHE, ENVIO)
- Copyright text: "© 2026 COMPLYR INFRASTRUCTURE. ENCRYPTED COMPUTATION. IMMUTABLE AUDIT RECORDS. ONCHAIN SETTLEMENT."

## Authentication & Onboarding

**Login Page**
- Title: "Welcome back"
- Description: "Connect your wallet to access Complyr."
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
- Description (Idle): "We are deploying an isolated pair of smart contracts for your business. Ownership is transferred to you immediately, ensuring Complyr has zero admin rights."
- Description (Success): "Your Complyr smart registries are live on Sepolia. Moving to security settings…"
- Checklist:
  - "Deploy dedicated smart contracts for encrypted payments and compliance tests"
  - "Transfer full contract ownership directly to your wallet"
- Bonus block: "Demo Bonus", "Your workspace will be automatically funded with 5,000 cUSDC for testing."
- Button Loading States: "Deploying…", "Waiting for MetaMask…", "Confirming…"
- Buttons: "Retry", "Deploy Account"
- Bottom Hint: "Registering {wallet} on Sepolia"
- Error Messages: "This wallet is already registered. Refreshing…", "Transaction failed. Please retry."

**Onboarding - Step 2: Initialize Defaults**
- Title: "Demo Configuration"
- Description: "We will now initialize your workspace with standard threshold rules based on your 5,000 cUSDC demo balance. These values are encrypted via FHE before being stored on-chain."
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

**Transaction History Page**
- Title: "Transaction History"
- Subtitle (Empty): "All onchain payments recorded in your audit registry."
- Subtitle (With txs): "{rows.length} payment(s) recorded. Encrypted amounts can be decrypted on demand since you are the owner."
- Button: "Refresh"
- Empty State: "No transactions yet", "Your onchain transaction history will appear here after your first payment."
- Table Headers: "Date", "Recipient", "Amount", "Actions"
- Cell States: "Encrypted", "Decrypting…", "Decrypted", "Retry", "Decrypt"

## Dashboard / Payments

**Payment Form - Single Payment Tab**
- Alerts: "No auditor assigned", "You haven't authorized an external auditor yet. Check out the Audits page to add an auditor and enable private audits of your encrypted payment records."
- Card Title: "Create Payment"
- Card Description: "Send a secure, FHE-encrypted payment with an immutable audit record."
- Inputs: "Recipient Address", "Amount", "Category (GL)", "Invoice", "Purchase Order"
- Balance Info: "Insufficient balance (Current: {formatted} USDC)"
- Document Info: "Supporting Documents (Optional)"
- Validation Errors: "Invalid Ethereum address", "Amount must be greater than 0", "GL Category is required"

**Submit Section**
- Submit Info Text: "Values are encrypted locally via FHE before being sent onchain."
- Button States: "Processing", "Success ✓", "Send Payment"

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
- Card Buttons: "Share Past Records", "Revoke"
- Tooltips: "Grant access to past encrypted payments", "Revoke auditor access"
- Modals:
  - Grant Access: "Are you absolutely sure?", "This action will grant {newAccess} access to {newAddress}. They will be able to see the data permitted under this tier.", "Grant Access", "Cancel"
  - Revoke Access: "Are you absolutely sure?", "This action will revoke all access for {auditorToRevoke}. They will no longer be able to read any encrypted data or access analytics.", "Revoke Access", "Cancel"
  - Historical Access: "Share Historical Records", "This auditor currently only has access to future payments. You can selectively decrypt and share your past payment history with them.", "All Past Records", "Recent Records", "Share all {count} existing payments.", "Share the last {recentCount} payments.", "Granting access to large numbers of payments at once will consume more gas. Consider granting access in batches if the transaction fails."

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
- Buttons: "Authorize Approver", "Remove Approver", "Set Encrypted Tier"
- Status text: "Authorized", "Encrypting…", "Confirming in Wallet…", "Updating onchain…", "Tier Set"

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
- Description: "Encrypted rollup totals across GL categories and recipients. Decrypt to reveal values."
- Section 1: "GL Category Totals"
- Section 2: "Recipient Concentration", "Cumulative spend per recipient."
- Loading States: "Loading…", "Querying payment events…"
- Empty States: "No payments recorded yet."
- Values States: "Encrypted" (Lock icon), "—"
- Buttons: "Refresh", "Decrypt All", "Decrypting…", "Decrypted"

**Findings**
- Title: "Findings"
- Subtext (Zero): "Payment records that triggered one of your configured audit tests."
- Subtext (Active): "{count} finding(s) in your engagement. Full access — decrypt flagged values on demand."
- Empty State: "No findings yet", "When a payment triggers one of your tests, it will appear here."
- Filters: "All Test Types", "All Severities"
- Test Types: "Materiality", "Auth Breach", "Segregation of Duties", "Missing Evidence", "Category Concentration", "Recipient Concentration"
- Severities: "None", "Low", "Medium", "Critical"
- Table Headers: "Payment ID", "Test Type", "Severity", "Block", "Flagged Value", "Actions"
- Buttons: "Decrypt", "No Access" (title: "Historical access not granted for this payment"), "Details", "Collapse", "Retry"
- Tooltips: "shared"

**Payments (In-scope)**
- Title: "Payments"
- Description (Zero): "Payments within your engagement scope. Only records you have been explicitly granted access to are shown."
- Description (Active): "{count} payment(s) in scope. Encrypted amounts, categories and authorization levels can be decrypted on demand."
- Empty State: "No in-scope payments", "Ask the business owner to grant historical access, or wait for new payments to be recorded after your engagement started."
- Table Headers: "ID", "Recipient", "Amount", "Status", "Evidence", "Block", "Actions"
- Status Badges: "Approved", "Pending"
- Evidence Tags: "INV ✓", "INV —", "PO ✓", "PO —"
- Buttons: "Decrypt", "Re-decrypt", "Retry", "Details", "Collapse", loading spinner

**Test Configurator & Rules**
- Test Rules Title: "Test Suite"
- Test Rules Description: "Configure encrypted audit thresholds. Threshold values are FHE-encrypted before leaving your browser."
- Test Definitions:
  - "Materiality": "Flags any payment above the configured threshold."
  - "Authorization Breach": "Flags if the approver's authority tier was insufficient for the payment amount."
  - "Segregation of Duties": "Flags if the same person initiated and approved a payment, or if the recipient approved their own payment."
  - "Missing Evidence": "Flags payments above the threshold that lack a supporting invoice or document hash."
  - "Category Concentration": "Flags when cumulative spend in a specific category exceeds the threshold."
  - "Recipient Concentration": "Flags when cumulative spend to a single recipient exceeds the threshold."
- Info Text: "These tests do not trigger during payments. They are evaluated automatically after approval"
- Badges: "Always Active", "Active", "Inactive"
- Labels: "Priority", "Scope", "Every X payments", "Threshold encrypted"
- Configurator Modal Title: "Configure {Test Name}"
- Inputs: 
  - "Priority Level" (Monitoring (Periodic), Standard (Every Payment), Critical (High Severity))
  - "Monitoring Frequency" (Every {X} payments)
  - "GL Category Scope" - "Only payments in this category will be tested."
  - "Threshold (cUSDC)" - "This value will be FHE encrypted before leaving your browser."
- Validation Errors: "Wallet not connected.", "Frequency must be greater than 0 for Monitoring priority.", "Encryption failed. Please retry."
- Buttons: "Configure", "Edit Config", "Cancel", "Save Configuration", "Encrypting…", "Confirming…", "Saving…"
