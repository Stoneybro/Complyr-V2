/**
 * Complyr V2 — Full Test Suite
 *
 * Runs against the @fhevm/hardhat-plugin mock harness (no Sepolia needed).
 * Covers all items from the Definition of Done in developmentplanV2.md.
 *
 * All contract pairs are deployed via ComplyrFactory (which uses EIP-1167 clones)
 * because the implementation contracts lock themselves in their constructors.
 *
 * Test sections:
 *   1. Factory — clone deployment and ownership wiring
 *   2. ConfidentialUSDC — mint, transfer
 *   3. AuditRegistry — onboarding gate, payment recording, authLevel derivation
 *   4. Payment Flow — confidentialTransferAndCallWithAudit end-to-end
 *   5. Approval — authorized approvers and SoD detection
 *   6. ReviewTestRegistry — test creation, all 6 active test types, two-phase findings
 *   7. ACL Boundaries — unauthorized addresses blocked at every access point
 *   8. Factory Isolation — two businesses have fully isolated state
 */

import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

// ─── Enums mirroring contracts ────────────────────────────────────────────────

enum Category {
  OPEX, CAPEX, PAYROLL, PROFESSIONAL, INTERCOMPANY, TAX, DEBT_SERVICE, OTHER
}
enum AuthLevel { ROUTINE, MANAGER, DIRECTOR, BOARD }
enum AuditorAccess { NONE, SIGNAL, ANALYTICS, FULL }
enum TestType {
  MATERIALITY,
  AUTHORIZATION_BREACH,
  SEGREGATION_OF_DUTIES,
  MISSING_EVIDENCE,
  CATEGORY_CONCENTRATION,
  RECIPIENT_CONCENTRATION,
  STRUCTURING,
}
enum Priority { NONE, MONITORING, STANDARD, CRITICAL }

// ─── FHE Encryption Helpers ───────────────────────────────────────────────────

async function encU64(contractAddress: string, signer: HardhatEthersSigner, value: bigint) {
  const input = hre.fhevm.createEncryptedInput(contractAddress, signer.address);
  input.add64(value);
  return input.encrypt();
}

async function encU8(contractAddress: string, signer: HardhatEthersSigner, value: number) {
  const input = hre.fhevm.createEncryptedInput(contractAddress, signer.address);
  input.add8(value);
  return input.encrypt();
}

async function encMulti(
  contractAddress: string,
  signer: HardhatEthersSigner,
  items: Array<{ t: "u64" | "u8"; v: number | bigint }>,
) {
  const input = hre.fhevm.createEncryptedInput(contractAddress, signer.address);
  for (const item of items) {
    if (item.t === "u64") input.add64(BigInt(item.v));
    else input.add8(Number(item.v));
  }
  return input.encrypt();
}

// ─── Deploy helpers ────────────────────────────────────────────────────────────

/**
 * Deploys the full system via ComplyrFactory and returns contract instances
 * for a single business (the `owner` signer acts as business wallet).
 *
 * DoA thresholds: manager>1000, director>5000, board>10000
 */
async function deploySystem() {
  const [deployer, business, recipient, auditor, auditorAnalytics, outsider, approver] =
    await hre.ethers.getSigners();

  // ── Deploy token ──────────────────────────────────────────────────────────
  const token = await (await hre.ethers.getContractFactory("ConfidentialUSDC"))
    .connect(deployer).deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  // ── Deploy implementations ────────────────────────────────────────────────
  const arImpl = await (await hre.ethers.getContractFactory("AuditRegistry"))
    .connect(deployer).deploy();
  await arImpl.waitForDeployment();

  const rtrImpl = await (await hre.ethers.getContractFactory("ReviewTestRegistry"))
    .connect(deployer).deploy();
  await rtrImpl.waitForDeployment();

  // ── Deploy factory ────────────────────────────────────────────────────────
  const factory = await (await hre.ethers.getContractFactory("ComplyrFactory"))
    .connect(deployer)
    .deploy(tokenAddress, await arImpl.getAddress(), await rtrImpl.getAddress());
  await factory.waitForDeployment();

  // ── Deploy business registry pair ─────────────────────────────────────────
  await factory.connect(deployer).deployRegistry(business.address);
  const reg = await factory.getRegistry(business.address);

  const auditRegistry = await hre.ethers.getContractAt("AuditRegistry", reg.auditRegistry);
  const reviewRegistry = await hre.ethers.getContractAt("ReviewTestRegistry", reg.reviewTestRegistry);
  const arAddress = reg.auditRegistry;
  const rtrAddress = reg.reviewTestRegistry;

  // assertCoprocessorInitialized checks bytecode for ZamaEthereumConfig.
  // EIP-1167 proxies are 55-byte stubs — only the implementations contain ZamaConfig.
  // FHE operations work via delegation; the impl constructor sets the coprocessor.
  await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialUSDC");
  await hre.fhevm.assertCoprocessorInitialized(arImpl, "AuditRegistry");
  await hre.fhevm.assertCoprocessorInitialized(rtrImpl, "ReviewTestRegistry");

  // ── Business configures DoA thresholds ────────────────────────────────────
  const thresholds = await encMulti(arAddress, business, [
    { t: "u64", v: 1_000n },
    { t: "u64", v: 5_000n },
    { t: "u64", v: 10_000n },
  ]);
  await auditRegistry.connect(business).setAuthTierThresholds(
    thresholds.handles[0],
    thresholds.handles[1],
    thresholds.handles[2],
    thresholds.inputProof,
  );

  // ── Business grants auditor access ───────────────────────────────────────
  await auditRegistry.connect(business).setAuditorAccess(auditor.address, AuditorAccess.FULL);
  await auditRegistry.connect(business).setAuditorAccess(auditorAnalytics.address, AuditorAccess.ANALYTICS);

  // ── Business sets authorized approver ─────────────────────────────────────
  await auditRegistry.connect(business).setAuthorizedApprover(approver.address, true);

  // ── Mint cUSDC to business wallet ─────────────────────────────────────────
  const mintEnc = await encU64(tokenAddress, deployer, 1_000_000n);
  await token.connect(deployer).mint(business.address, mintEnc.handles[0], mintEnc.inputProof);

  return {
    deployer, business, recipient, auditor, auditorAnalytics, outsider, approver,
    token, tokenAddress,
    auditRegistry, arAddress,
    reviewRegistry, rtrAddress,
    factory,
  };
}

// ─── Payment helper ───────────────────────────────────────────────────────────

async function sendPayment(
  fixture: Awaited<ReturnType<typeof deploySystem>>,
  amount: bigint,
  category: Category,
  invoiceHash: string = ethers.ZeroHash,
  poHash: string = ethers.ZeroHash,
) {
  const { business, recipient, token, tokenAddress, arAddress } = fixture;

  const amountEnc = await encU64(tokenAddress, business, amount);
  const categoryEnc = await encU8(tokenAddress, business, category);

  await token.connect(business).confidentialTransferAndCallWithAudit(
    arAddress,
    amountEnc.handles[0],
    amountEnc.inputProof,
    {
      category: categoryEnc.handles[0],
      inputProof: categoryEnc.inputProof,
      recipient: recipient.address,
      invoiceHash,
      poHash,
    },
  );
}

// ─── Test helper ──────────────────────────────────────────────────────────────

async function createAuditTest(
  fixture: Awaited<ReturnType<typeof deploySystem>>,
  auditorSigner: HardhatEthersSigner,
  testType: TestType,
  threshold: bigint,
  priority: Priority = Priority.CRITICAL,
  scope = 0,
  monitoringFrequency = 0,
) {
  const { reviewRegistry, rtrAddress } = fixture;
  const enc = await encU64(rtrAddress, auditorSigner, threshold);
  await reviewRegistry
    .connect(auditorSigner)
    .createTest(testType, scope, enc.handles[0], enc.inputProof, priority, monitoringFrequency);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ComplyrFactory
// ─────────────────────────────────────────────────────────────────────────────

describe("1. ComplyrFactory", function () {
  it("deploys an isolated (AuditRegistry, ReviewTestRegistry) clone pair per business", async function () {
    const fixture = await deploySystem();
    const { factory, business, arAddress, rtrAddress } = fixture;

    const reg = await factory.getRegistry(business.address);
    expect(reg.active).to.equal(true);
    expect(reg.auditRegistry).to.equal(arAddress);
    expect(reg.reviewTestRegistry).to.equal(rtrAddress);
    expect(reg.deployedAtBlock).to.be.gt(0n);
    expect(await factory.businessCount()).to.equal(1n);
  });

  it("reverts if the same business address is deployed twice", async function () {
    const fixture = await deploySystem();
    const { factory, business } = fixture;

    await expect(
      factory.connect(fixture.deployer).deployRegistry(business.address),
    ).to.be.revertedWithCustomError(factory, "AlreadyRegistered");
  });

  it("factory has zero privileged access after deployRegistry — business is owner", async function () {
    const fixture = await deploySystem();
    const { auditRegistry, business, outsider } = fixture;

    expect(await auditRegistry.owner()).to.equal(business.address);

    // Outsider cannot call onlyOwner functions
    await expect(
      auditRegistry.connect(outsider).setAuditorAccess(outsider.address, AuditorAccess.FULL),
    ).to.be.revertedWithCustomError(auditRegistry, "NotOwner");
  });

  it("ReviewTestRegistry is wired to AuditRegistry, not occupying an auditor slot", async function () {
    const fixture = await deploySystem();
    const { auditRegistry, reviewRegistry, rtrAddress } = fixture;

    // RTR is set as the paired registry
    expect(await auditRegistry.reviewTestRegistry()).to.equal(rtrAddress);

    // RTR address itself does not have an auditorAccess slot
    const rtrAccess = await auditRegistry.auditorAccess(rtrAddress);
    expect(rtrAccess).to.equal(AuditorAccess.NONE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ConfidentialUSDC
// ─────────────────────────────────────────────────────────────────────────────

describe("2. ConfidentialUSDC", function () {
  it("mint increases recipient balance (encrypted, decryptable by recipient)", async function () {
    const fixture = await deploySystem();
    const { business, token, tokenAddress } = fixture;

    const balanceHandle = await token.confidentialBalanceOf(business.address);
    const clear = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      balanceHandle,
      tokenAddress,
      business as unknown as ethers.Signer,
    );
    expect(clear).to.equal(1_000_000n);
  });

  it("confidentialTransfer moves encrypted balance between accounts", async function () {
    const fixture = await deploySystem();
    const { business, recipient, token, tokenAddress } = fixture;

    const transferEnc = await encU64(tokenAddress, business, 5_000n);
    // Use the external-handle overload: confidentialTransfer(address, externalEuint64, bytes)
    // to avoid ethers ambiguity with the internal-handle overload.
    await token
      .connect(business)
      ["confidentialTransfer(address,bytes32,bytes)"](recipient.address, transferEnc.handles[0], transferEnc.inputProof);

    const recipientHandle = await token.confidentialBalanceOf(recipient.address);
    const clearRecipient = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      recipientHandle,
      tokenAddress,
      recipient as unknown as ethers.Signer,
    );
    expect(clearRecipient).to.equal(5_000n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. AuditRegistry — Onboarding Gate
// ─────────────────────────────────────────────────────────────────────────────

describe("3. AuditRegistry — onboarding gate", function () {
  it("rejects payments before auth thresholds are configured", async function () {
    const [deployer, businessB, recipientB] = await hre.ethers.getSigners();

    const token = await (await hre.ethers.getContractFactory("ConfidentialUSDC"))
      .connect(deployer).deploy();
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    const arImpl = await (await hre.ethers.getContractFactory("AuditRegistry")).connect(deployer).deploy();
    await arImpl.waitForDeployment();
    const rtrImpl = await (await hre.ethers.getContractFactory("ReviewTestRegistry")).connect(deployer).deploy();
    await rtrImpl.waitForDeployment();

    const factory2 = await (await hre.ethers.getContractFactory("ComplyrFactory"))
      .connect(deployer)
      .deploy(tokenAddress, await arImpl.getAddress(), await rtrImpl.getAddress());
    await factory2.waitForDeployment();

    await factory2.connect(deployer).deployRegistry(businessB.address);
    const reg2 = await factory2.getRegistry(businessB.address);

    // Mint to businessB
    const mintEnc = await encU64(tokenAddress, deployer, 10_000n);
    await token.connect(deployer).mint(businessB.address, mintEnc.handles[0], mintEnc.inputProof);

    // Attempt payment without configuring thresholds first
    const amountEnc = await encU64(tokenAddress, businessB, 500n);
    const categoryEnc = await encU8(tokenAddress, businessB, Category.OPEX);

    await expect(
      token.connect(businessB).confidentialTransferAndCallWithAudit(
        reg2.auditRegistry,
        amountEnc.handles[0],
        amountEnc.inputProof,
        {
          category: categoryEnc.handles[0],
          inputProof: categoryEnc.inputProof,
          recipient: recipientB.address,
          invoiceHash: ethers.ZeroHash,
          poHash: ethers.ZeroHash,
        },
      ),
    ).to.be.reverted; // ThresholdsNotConfigured propagates through the callback
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Payment Recording
// ─────────────────────────────────────────────────────────────────────────────

describe("4. Payment Recording", function () {
  it("payment count increments after each payment", async function () {
    const fixture = await deploySystem();
    await sendPayment(fixture, 500n, Category.OPEX);
    expect(await fixture.auditRegistry.paymentCount()).to.equal(1n);
    await sendPayment(fixture, 1_500n, Category.PAYROLL);
    expect(await fixture.auditRegistry.paymentCount()).to.equal(2n);
  });

  it("payment metadata records correct sender, recipient, hashes, and approved=false", async function () {
    const fixture = await deploySystem();
    const { business, recipient, auditRegistry } = fixture;

    const invoice = ethers.id("invoice-2024-001");
    const po = ethers.id("po-2024-001");
    await sendPayment(fixture, 1_000n, Category.CAPEX, invoice, po);

    const meta = await auditRegistry.connect(business).getPaymentMeta(0);
    expect(meta.sender).to.equal(business.address);
    expect(meta.recipient).to.equal(recipient.address);
    expect(meta.invoiceHash).to.equal(invoice);
    expect(meta.poHash).to.equal(po);
    expect(meta.approved).to.equal(false);
    expect(meta.approver).to.equal(ethers.ZeroAddress);
  });

  it("amount in audit record equals the actual token transfer — not self-reported", async function () {
    const fixture = await deploySystem();
    const { auditor, arAddress, auditRegistry } = fixture;

    await sendPayment(fixture, 4_200n, Category.PROFESSIONAL);

    const handles = await auditRegistry.connect(auditor).getPaymentHandles(0);
    const clearAmount = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      handles.amount,
      arAddress,
      auditor as unknown as ethers.Signer,
    );
    expect(clearAmount).to.equal(4_200n);
  });

  it("recipient receives the cUSDC after the AuditRegistry forwards it", async function () {
    const fixture = await deploySystem();
    const { recipient, token, tokenAddress } = fixture;

    await sendPayment(fixture, 2_500n, Category.OPEX);

    const balHandle = await token.confidentialBalanceOf(recipient.address);
    const clearBal = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      balHandle,
      tokenAddress,
      recipient as unknown as ethers.Signer,
    );
    expect(clearBal).to.equal(2_500n);
  });

  it("authLevel is contract-derived from amount vs DoA thresholds — all four bands", async function () {
    const fixture = await deploySystem();
    const { auditor, arAddress, auditRegistry } = fixture;

    await sendPayment(fixture, 500n,    Category.OPEX);   // ROUTINE
    await sendPayment(fixture, 3_000n,  Category.CAPEX);  // MANAGER
    await sendPayment(fixture, 7_000n,  Category.TAX);    // DIRECTOR
    await sendPayment(fixture, 15_000n, Category.PAYROLL);// BOARD

    const decryptAuthLevel = async (id: number) => {
      const handles = await auditRegistry.connect(auditor).getPaymentHandles(id);
      return hre.fhevm.userDecryptEuint(
        FhevmType.euint8,
        handles.authLevel,
        arAddress,
        auditor as unknown as ethers.Signer,
      );
    };

    expect(await decryptAuthLevel(0)).to.equal(BigInt(AuthLevel.ROUTINE));
    expect(await decryptAuthLevel(1)).to.equal(BigInt(AuthLevel.MANAGER));
    expect(await decryptAuthLevel(2)).to.equal(BigInt(AuthLevel.DIRECTOR));
    expect(await decryptAuthLevel(3)).to.equal(BigInt(AuthLevel.BOARD));
  });

  it("approved and approver are always false/address(0) at creation", async function () {
    const fixture = await deploySystem();
    const { business, auditRegistry } = fixture;

    await sendPayment(fixture, 1_500n, Category.PROFESSIONAL);

    const meta = await auditRegistry.connect(business).getPaymentMeta(0);
    expect(meta.approved).to.equal(false);
    expect(meta.approver).to.equal(ethers.ZeroAddress);
  });

  it("category rollups accumulate blindly across all 8 buckets", async function () {
    const fixture = await deploySystem();
    const { auditor, arAddress, auditRegistry } = fixture;

    await sendPayment(fixture, 1_000n, Category.OPEX);
    await sendPayment(fixture, 2_000n, Category.PAYROLL);

    const decryptTotal = async (bucket: Category) => {
      const handle = await auditRegistry.connect(auditor).getCategoryTotal(bucket);
      return hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        arAddress,
        auditor as unknown as ethers.Signer,
      );
    };

    expect(await decryptTotal(Category.OPEX)).to.equal(1_000n);
    expect(await decryptTotal(Category.PAYROLL)).to.equal(2_000n);
    expect(await decryptTotal(Category.CAPEX)).to.equal(0n);
    expect(await decryptTotal(Category.TAX)).to.equal(0n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Approvals and Segregation of Duties
// ─────────────────────────────────────────────────────────────────────────────

describe("5. Approvals and SoD", function () {
  it("authorized approver can approve a payment — approved=true, approver set", async function () {
    const fixture = await deploySystem();
    const { approver, business, auditRegistry } = fixture;

    await sendPayment(fixture, 2_000n, Category.OPEX);
    await auditRegistry.connect(approver).approvePayment(0);

    const meta = await auditRegistry.connect(business).getPaymentMeta(0);
    expect(meta.approved).to.equal(true);
    expect(meta.approver).to.equal(approver.address);
  });

  it("unauthorized address cannot call approvePayment", async function () {
    const fixture = await deploySystem();
    const { outsider, business, auditRegistry } = fixture;

    await sendPayment(fixture, 2_000n, Category.OPEX);

    // Outsider has no approval rights
    await expect(
      auditRegistry.connect(outsider).approvePayment(0),
    ).to.be.revertedWithCustomError(auditRegistry, "Unauthorized");

    // Business itself is not an authorized approver by default
    await expect(
      auditRegistry.connect(business).approvePayment(0),
    ).to.be.revertedWithCustomError(auditRegistry, "Unauthorized");
  });

  it("double-approval reverts with PaymentAlreadyApproved", async function () {
    const fixture = await deploySystem();
    const { approver, auditRegistry } = fixture;

    await sendPayment(fixture, 2_000n, Category.OPEX);
    await auditRegistry.connect(approver).approvePayment(0);

    await expect(
      auditRegistry.connect(approver).approvePayment(0),
    ).to.be.revertedWithCustomError(auditRegistry, "PaymentAlreadyApproved");
  });

  it("SoD finding is created when the authorized approver is also the payment sender", async function () {
    const fixture = await deploySystem();
    const { business, auditRegistry } = fixture;

    // Misconfigure: give the business wallet (the sender) approval rights
    await auditRegistry.connect(business).setAuthorizedApprover(business.address, true);

    await sendPayment(fixture, 3_000n, Category.OPEX);

    const findingsBefore = await auditRegistry.findingCount();
    await auditRegistry.connect(business).approvePayment(0);
    const findingsAfter = await auditRegistry.findingCount();

    // A SoD finding must have been created
    expect(findingsAfter).to.be.gt(findingsBefore);
  });

  it("setAuthorizedApprover can revoke approval rights", async function () {
    const fixture = await deploySystem();
    const { business, approver, auditRegistry } = fixture;

    await sendPayment(fixture, 2_000n, Category.OPEX);

    // Revoke approver
    await auditRegistry.connect(business).setAuthorizedApprover(approver.address, false);

    await expect(
      auditRegistry.connect(approver).approvePayment(0),
    ).to.be.revertedWithCustomError(auditRegistry, "Unauthorized");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ReviewTestRegistry — Test Types
// ─────────────────────────────────────────────────────────────────────────────

describe("6. ReviewTestRegistry — test evaluation", function () {
  it("only ANALYTICS/FULL auditors can create tests; outsiders are rejected", async function () {
    const fixture = await deploySystem();
    const { outsider, reviewRegistry, rtrAddress } = fixture;

    const enc = await encU64(rtrAddress, outsider, 5_000n);
    await expect(
      reviewRegistry.connect(outsider).createTest(
        TestType.MATERIALITY, 0, enc.handles[0], enc.inputProof, Priority.CRITICAL, 0,
      ),
    ).to.be.revertedWithCustomError(reviewRegistry, "Unauthorized");
  });

  it("MATERIALITY: fires above threshold, silent below", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry, rtrAddress } = fixture;

    await createAuditTest(fixture, auditor, TestType.MATERIALITY, 5_000n);

    await sendPayment(fixture, 4_000n, Category.OPEX);  // below — should not fire
    await sendPayment(fixture, 6_000n, Category.OPEX);  // above — should fire

    const getResult = async (paymentId: number) => {
      const handle = await reviewRegistry
        .connect(auditor)
        .getTestResult(auditor.address, paymentId, TestType.MATERIALITY);
      return hre.fhevm.userDecryptEbool(handle, rtrAddress, auditor as unknown as ethers.Signer);
    };

    expect(await getResult(0)).to.equal(false);
    expect(await getResult(1)).to.equal(true);
  });

  it("AUTHORIZATION_BREACH: fires for non-ROUTINE payments (approved always false at creation)", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry, rtrAddress } = fixture;

    // threshold=0 means authLevel > 0 triggers (any non-routine payment)
    await createAuditTest(fixture, auditor, TestType.AUTHORIZATION_BREACH, 0n);

    await sendPayment(fixture, 500n,   Category.OPEX);  // ROUTINE — no breach
    await sendPayment(fixture, 3_000n, Category.CAPEX); // MANAGER — breach

    const getResult = async (paymentId: number) => {
      const handle = await reviewRegistry
        .connect(auditor)
        .getTestResult(auditor.address, paymentId, TestType.AUTHORIZATION_BREACH);
      return hre.fhevm.userDecryptEbool(handle, rtrAddress, auditor as unknown as ethers.Signer);
    };

    expect(await getResult(0)).to.equal(false);
    expect(await getResult(1)).to.equal(true);
  });

  it("MISSING_EVIDENCE: skipped when invoiceHash is provided; fires when absent and amount > threshold", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry } = fixture;

    await createAuditTest(fixture, auditor, TestType.MISSING_EVIDENCE, 1_000n);

    // Payment WITH invoice — test skips (no FHE cost if document was provided)
    await sendPayment(fixture, 2_000n, Category.OPEX, ethers.id("invoice-hash"));
    // Payment WITHOUT invoice, amount > threshold — test runs and fires
    await sendPayment(fixture, 2_000n, Category.OPEX, ethers.ZeroHash);

    // Payment 0: invoiceHash provided → evaluateAll skips MISSING_EVIDENCE → no result stored
    await expect(
      reviewRegistry.connect(auditor).getTestResult(auditor.address, 0, TestType.MISSING_EVIDENCE),
    ).to.be.revertedWithCustomError(reviewRegistry, "ResultNotAvailable");

    // Payment 1: no invoice → result stored and fires
    const { rtrAddress } = fixture;
    const handle = await reviewRegistry
      .connect(auditor)
      .getTestResult(auditor.address, 1, TestType.MISSING_EVIDENCE);
    const fired = await hre.fhevm.userDecryptEbool(
      handle,
      rtrAddress,
      auditor as unknown as ethers.Signer,
    );
    expect(fired).to.equal(true);
  });

  it("CATEGORY_CONCENTRATION: fires when GL bucket total exceeds threshold", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry, rtrAddress } = fixture;

    // OPEX bucket, threshold = 3000
    await createAuditTest(
      fixture, auditor, TestType.CATEGORY_CONCENTRATION, 3_000n, Priority.CRITICAL, Category.OPEX,
    );

    await sendPayment(fixture, 2_000n, Category.OPEX); // total 2000 — no fire
    await sendPayment(fixture, 2_000n, Category.OPEX); // total 4000 — fires

    const getResult = async (paymentId: number) => {
      const handle = await reviewRegistry
        .connect(auditor)
        .getTestResult(auditor.address, paymentId, TestType.CATEGORY_CONCENTRATION);
      return hre.fhevm.userDecryptEbool(handle, rtrAddress, auditor as unknown as ethers.Signer);
    };

    expect(await getResult(0)).to.equal(false);
    expect(await getResult(1)).to.equal(true);
  });

  it("RECIPIENT_CONCENTRATION: fires when per-recipient cumulative total exceeds threshold", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry, rtrAddress } = fixture;

    await createAuditTest(fixture, auditor, TestType.RECIPIENT_CONCENTRATION, 4_000n);

    await sendPayment(fixture, 3_000n, Category.OPEX); // recipient total 3000 — no fire
    await sendPayment(fixture, 2_000n, Category.OPEX); // recipient total 5000 — fires

    const getResult = async (paymentId: number) => {
      const handle = await reviewRegistry
        .connect(auditor)
        .getTestResult(auditor.address, paymentId, TestType.RECIPIENT_CONCENTRATION);
      return hre.fhevm.userDecryptEbool(handle, rtrAddress, auditor as unknown as ethers.Signer);
    };

    expect(await getResult(0)).to.equal(false);
    expect(await getResult(1)).to.equal(true);
  });

  it("SEGREGATION_OF_DUTIES: fires via createSodFinding when sender == authorized approver", async function () {
    const fixture = await deploySystem();
    const { business, auditRegistry } = fixture;

    // Grant business wallet approval rights (a misconfiguration creating SoD risk)
    await auditRegistry.connect(business).setAuthorizedApprover(business.address, true);

    await sendPayment(fixture, 2_000n, Category.OPEX);

    const before = await auditRegistry.findingCount();
    await auditRegistry.connect(business).approvePayment(0);
    const after = await auditRegistry.findingCount();

    expect(after).to.be.gt(before);
  });

  it("MONITORING tests run only on Nth recipient occurrence, not every payment", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry } = fixture;

    // Run every 2nd payment to this recipient
    await createAuditTest(
      fixture, auditor, TestType.RECIPIENT_CONCENTRATION, 1_000n, Priority.MONITORING, 0, 2,
    );

    await sendPayment(fixture, 1_500n, Category.OPEX); // 1st — should NOT run
    await sendPayment(fixture, 1_500n, Category.OPEX); // 2nd — SHOULD run

    // 1st payment: no result (test didn't run)
    await expect(
      reviewRegistry.connect(auditor).getTestResult(auditor.address, 0, TestType.RECIPIENT_CONCENTRATION),
    ).to.be.revertedWithCustomError(reviewRegistry, "ResultNotAvailable");

    // 2nd payment: result is stored — call directly (view functions don't produce receipts)
    const handle = await reviewRegistry
      .connect(auditor)
      .getTestResult(auditor.address, 1, TestType.RECIPIENT_CONCENTRATION);
    expect(handle).to.not.equal(ethers.ZeroHash); // a valid FHE handle is non-zero
  });

  it("recordFindingIfTriggered(false) leaves no on-chain finding trace", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry, auditRegistry } = fixture;

    await createAuditTest(fixture, auditor, TestType.MATERIALITY, 5_000n);
    await sendPayment(fixture, 2_000n, Category.OPEX); // below threshold — doesn't fire

    // Auditor requests and supplies triggered=false
    await reviewRegistry.connect(auditor).requestFindingCreation(0, TestType.MATERIALITY);
    await reviewRegistry.connect(auditor).recordFindingIfTriggered(0, TestType.MATERIALITY, false);

    expect(await auditRegistry.findingCount()).to.equal(0n);
  });

  it("recordFindingIfTriggered(true) creates a finding with correct testType and severity", async function () {
    const fixture = await deploySystem();
    const { auditor, reviewRegistry, auditRegistry } = fixture;

    await createAuditTest(fixture, auditor, TestType.MATERIALITY, 500n);
    await sendPayment(fixture, 2_000n, Category.OPEX); // above threshold — fires

    await reviewRegistry.connect(auditor).requestFindingCreation(0, TestType.MATERIALITY);
    await reviewRegistry.connect(auditor).recordFindingIfTriggered(0, TestType.MATERIALITY, true);

    expect(await auditRegistry.findingCount()).to.equal(1n);

    const finding = await auditRegistry.connect(auditor).getFinding(0);
    expect(finding.testType).to.equal(TestType.MATERIALITY);
    expect(finding.severity).to.equal(Priority.CRITICAL); // test was CRITICAL priority
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ACL Boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe("7. ACL Boundaries", function () {
  it("unauthorized address cannot call getPaymentHandles", async function () {
    const fixture = await deploySystem();
    const { outsider, auditRegistry } = fixture;

    await sendPayment(fixture, 1_000n, Category.OPEX);

    await expect(
      auditRegistry.connect(outsider).getPaymentHandles(0),
    ).to.be.revertedWithCustomError(auditRegistry, "Unauthorized");
  });

  it("ANALYTICS auditor can read category totals but NOT raw payment handles", async function () {
    const fixture = await deploySystem();
    const { auditorAnalytics, auditRegistry } = fixture;

    await sendPayment(fixture, 1_000n, Category.OPEX);

    // Can read rollup totals (view call — check it doesn't throw)
    await auditRegistry.connect(auditorAnalytics).getCategoryTotal(Category.OPEX);

    // Cannot read raw handles (should revert)
    await expect(
      auditRegistry.connect(auditorAnalytics).getPaymentHandles(0),
    ).to.be.revertedWithCustomError(auditRegistry, "Unauthorized");
  });

  it("FULL auditor can read both analytics and raw payment handles", async function () {
    const fixture = await deploySystem();
    const { auditor, auditRegistry } = fixture;

    await sendPayment(fixture, 1_000n, Category.OPEX);

    // Both calls are view functions — just call them directly to verify no revert
    await auditRegistry.connect(auditor).getCategoryTotal(Category.OPEX);
    await auditRegistry.connect(auditor).getPaymentHandles(0);
  });

  it("sender and recipient can both read their own payment metadata and handles", async function () {
    const fixture = await deploySystem();
    const { business, recipient, auditRegistry } = fixture;

    await sendPayment(fixture, 1_500n, Category.PAYROLL);

    await expect(auditRegistry.connect(business).getPaymentMeta(0)).to.not.be.reverted;
    await expect(auditRegistry.connect(recipient).getPaymentMeta(0)).to.not.be.reverted;
    await expect(auditRegistry.connect(business).getPaymentHandles(0)).to.not.be.reverted;
    await expect(auditRegistry.connect(recipient).getPaymentHandles(0)).to.not.be.reverted;
  });

  it("recordFinding can only be called by the paired ReviewTestRegistry", async function () {
    const fixture = await deploySystem();
    const { outsider, auditor, auditRegistry } = fixture;

    await sendPayment(fixture, 1_000n, Category.OPEX);

    await expect(
      auditRegistry
        .connect(outsider)
        .recordFinding(0, TestType.MATERIALITY, Priority.CRITICAL, ethers.ZeroHash, ethers.ZeroHash, auditor.address),
    ).to.be.revertedWithCustomError(auditRegistry, "NotReviewRegistry");
  });

  it("outsider cannot read test results that belong to another auditor", async function () {
    const fixture = await deploySystem();
    const { auditor, outsider, reviewRegistry } = fixture;

    await createAuditTest(fixture, auditor, TestType.MATERIALITY, 1_000n);
    await sendPayment(fixture, 2_000n, Category.OPEX);

    await expect(
      reviewRegistry.connect(outsider).getTestResult(auditor.address, 0, TestType.MATERIALITY),
    ).to.be.revertedWithCustomError(reviewRegistry, "Unauthorized");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Factory Isolation
// ─────────────────────────────────────────────────────────────────────────────

describe("8. Factory Isolation", function () {
  it("two businesses have completely isolated registries — different addresses and owners", async function () {
    const fixture = await deploySystem();
    const { factory, deployer, arAddress, rtrAddress, business, outsider } = fixture;

    // Deploy a second business registry
    await factory.connect(deployer).deployRegistry(outsider.address);
    const regB = await factory.getRegistry(outsider.address);

    // Addresses are distinct
    expect(regB.auditRegistry).to.not.equal(arAddress);
    expect(regB.reviewTestRegistry).to.not.equal(rtrAddress);

    // Each registry has its own owner
    const arB = await hre.ethers.getContractAt("AuditRegistry", regB.auditRegistry);
    expect(await arB.owner()).to.equal(outsider.address);

    // Business A wallet cannot admin Business B's registry
    await expect(
      arB.connect(business).setAuditorAccess(business.address, AuditorAccess.FULL),
    ).to.be.revertedWithCustomError(arB, "NotOwner");
  });

  it("payments and rollups in one registry do not affect another", async function () {
    const fixture = await deploySystem();
    const { factory, deployer, outsider, token, tokenAddress, arAddress } = fixture;

    // Deploy second business
    await factory.connect(deployer).deployRegistry(outsider.address);
    const regB = await factory.getRegistry(outsider.address);
    const arB = await hre.ethers.getContractAt("AuditRegistry", regB.auditRegistry);

    // Send a payment through Business A's registry
    await sendPayment(fixture, 5_000n, Category.OPEX);

    expect(await fixture.auditRegistry.paymentCount()).to.equal(1n);

    // Business B's registry has zero payments
    expect(await arB.paymentCount()).to.equal(0n);
  });
});
