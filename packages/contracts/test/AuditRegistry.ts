import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

const ZERO_BYTES32 = ethers.ZeroHash;

async function encryptedInput(
  contractAddress: string,
  signer: HardhatEthersSigner,
  values: Array<{ type: "u64" | "u8"; value: number | bigint }>,
) {
  const input = hre.fhevm.createEncryptedInput(contractAddress, signer.address);
  for (const item of values) {
    if (item.type === "u64") input.add64(item.value);
    if (item.type === "u8") input.add8(Number(item.value));
  }
  return input.encrypt();
}

async function deployFixture() {
  const [owner, business, recipient, auditor, outsider, approver] = await hre.ethers.getSigners();

  const tokenFactory = await hre.ethers.getContractFactory("ConfidentialUSDC");
  const token = await tokenFactory.connect(owner).deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  const registryFactory = await hre.ethers.getContractFactory("AuditRegistry");
  const registry = await registryFactory.connect(owner).deploy(tokenAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialUSDC");
  await hre.fhevm.assertCoprocessorInitialized(registry, "AuditRegistry");

  await registry.connect(owner).setAuditorAccess(auditor.address, 3);

  const thresholds = await encryptedInput(registryAddress, auditor, [
    { type: "u64", value: 1_000n },
    { type: "u64", value: 5_000n },
    { type: "u64", value: 10_000n },
  ]);
  await registry
    .connect(auditor)
    .setAuthTierThresholds(thresholds.handles[0], thresholds.handles[1], thresholds.handles[2], thresholds.inputProof);

  return { owner, business, recipient, auditor, outsider, approver, token, tokenAddress, registry, registryAddress };
}

function paymentFields(
  handles: string[],
  inputProof: string,
  recipient: string,
  overrides: Partial<{
    referenceId: string;
    docHash: string;
    jurisdictionCode: number;
    requiresApproval: boolean;
    approved: boolean;
    approver: string;
  }> = {},
) {
  return {
    purposeCode: handles[0],
    riskTier: handles[1],
    counterpartyType: handles[2],
    inputProof,
    recipient,
    referenceId: overrides.referenceId ?? ethers.id("invoice-1"),
    docHash: overrides.docHash ?? ZERO_BYTES32,
    jurisdictionCode: overrides.jurisdictionCode ?? 0,
    requiresApproval: overrides.requiresApproval ?? false,
    approved: overrides.approved ?? false,
    approver: overrides.approver ?? ethers.ZeroAddress,
  };
}

describe("AuditRegistry", function () {
  it("rejects payments until encrypted auth thresholds are configured", async function () {
    const [owner, business, recipient] = await hre.ethers.getSigners();

    const tokenFactory = await hre.ethers.getContractFactory("ConfidentialUSDC");
    const token = await tokenFactory.connect(owner).deploy();
    await token.waitForDeployment();

    const registryFactory = await hre.ethers.getContractFactory("AuditRegistry");
    const registry = await registryFactory.connect(owner).deploy(await token.getAddress());
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();

    const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: 100n }]);
    const fields = await encryptedInput(registryAddress, business, [
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
    ]);

    await expect(
      registry.connect(business).recordPayment(
        amount.handles[0],
        amount.inputProof,
        paymentFields(fields.handles, fields.inputProof, recipient.address),
      ),
    ).to.be.revertedWithCustomError(registry, "ThresholdsNotConfigured");
  });

  it("records encrypted payment fields and derives auth tier from encrypted amount", async function () {
    const { business, recipient, auditor, registry, registryAddress } = await deployFixture();

    const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: 6_000n }]);
    const fields = await encryptedInput(registryAddress, business, [
      { type: "u8", value: 1 },
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
    ]);

    await registry.connect(business).recordPayment(
      amount.handles[0],
      amount.inputProof,
      paymentFields(fields.handles, fields.inputProof, recipient.address),
    );

    expect(await registry.paymentCount()).to.equal(1n);
    const handles = await registry.connect(auditor).getPaymentHandles(0);

    const clearAmount = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      handles[0],
      registryAddress,
      auditor as unknown as ethers.Signer,
    );
    const clearPurpose = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      handles[1],
      registryAddress,
      auditor as unknown as ethers.Signer,
    );
    const clearRisk = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      handles[2],
      registryAddress,
      auditor as unknown as ethers.Signer,
    );
    const clearAuth = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      handles[4],
      registryAddress,
      auditor as unknown as ethers.Signer,
    );

    expect(clearAmount).to.equal(6_000n);
    expect(clearPurpose).to.equal(1n);
    expect(clearRisk).to.equal(0n);
    expect(clearAuth).to.equal(2n);
  });

  it("clamps sanctioned-jurisdiction risk to WATCHLIST", async function () {
    const { business, recipient, auditor, registry, registryAddress } = await deployFixture();

    const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: 700n }]);
    const fields = await encryptedInput(registryAddress, business, [
      { type: "u8", value: 3 },
      { type: "u8", value: 0 },
      { type: "u8", value: 1 },
    ]);

    await registry.connect(business).recordPayment(
      amount.handles[0],
      amount.inputProof,
      paymentFields(fields.handles, fields.inputProof, recipient.address, { jurisdictionCode: 4 }),
    );

    const handles = await registry.connect(auditor).getPaymentHandles(0);
    const clearRisk = await hre.fhevm.userDecryptEuint(
      FhevmType.euint8,
      handles[2],
      registryAddress,
      auditor as unknown as ethers.Signer,
    );

    expect(clearRisk).to.equal(3n);
  });

  it("updates encrypted rollups for purpose, risk, counterparty, jurisdiction, and recipient", async function () {
    const { business, recipient, auditor, registry, registryAddress } = await deployFixture();

    const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: 2_500n }]);
    const fields = await encryptedInput(registryAddress, business, [
      { type: "u8", value: 4 },
      { type: "u8", value: 2 },
      { type: "u8", value: 1 },
    ]);

    await registry.connect(business).recordPayment(
      amount.handles[0],
      amount.inputProof,
      paymentFields(fields.handles, fields.inputProof, recipient.address, { jurisdictionCode: 3 }),
    );

    const purposeTotal = await registry.connect(auditor).getPurposeTotal(4);
    const riskTotal = await registry.connect(auditor).getRiskTierTotal(2);
    const counterpartyTotal = await registry.connect(auditor).getCounterpartyTotal(1);
    const jurisdictionTotal = await registry.connect(auditor).getJurisdictionTotal(3);
    const recipientTotal = await registry.connect(auditor).getRecipientTotal(recipient.address);

    for (const handle of [purposeTotal, riskTotal, counterpartyTotal, jurisdictionTotal, recipientTotal]) {
      const clearTotal = await hre.fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        registryAddress,
        auditor as unknown as ethers.Signer,
      );
      expect(clearTotal).to.equal(2_500n);
    }
  });

  it("keeps full payment handles away from analytics-only auditors at the registry boundary", async function () {
    const { owner, business, recipient, outsider, registry, registryAddress } = await deployFixture();
    await registry.connect(owner).setAuditorAccess(outsider.address, 2);

    const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: 900n }]);
    const fields = await encryptedInput(registryAddress, business, [
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
    ]);

    await registry.connect(business).recordPayment(
      amount.handles[0],
      amount.inputProof,
      paymentFields(fields.handles, fields.inputProof, recipient.address),
    );

    await expect(registry.connect(outsider).getPaymentHandles(0)).to.be.revertedWithCustomError(registry, "Unauthorized");
    await registry.connect(outsider).getPurposeTotal(0);
  });

  it("supports document attachment and approval controls", async function () {
    const { business, recipient, approver, registry, registryAddress } = await deployFixture();

    const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: 1_500n }]);
    const fields = await encryptedInput(registryAddress, business, [
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
      { type: "u8", value: 0 },
    ]);

    await registry.connect(business).recordPayment(
      amount.handles[0],
      amount.inputProof,
      paymentFields(fields.handles, fields.inputProof, recipient.address, {
        requiresApproval: true,
        approver: approver.address,
      }),
    );

    expect(await registry.findingCount()).to.equal(1n);
    await expect(registry.connect(business).approvePayment(0)).to.be.revertedWithCustomError(registry, "SelfApproval");
    await registry.connect(approver).approvePayment(0);
    await registry.connect(business).attachDocument(0, ethers.id("doc-cid"));

    const meta = await registry.getPaymentMeta(0);
    expect(meta[2]).to.equal(approver.address);
    expect(meta[4]).to.equal(ethers.id("doc-cid"));
    expect(meta[8]).to.equal(true);
  });

  it("records through confidentialTransferAndCall using the token callback amount", async function () {
    const { owner, business, recipient, auditor, token, registry, registryAddress } = await deployFixture();
    const tokenAddress = await token.getAddress();

    const mintAmount = await encryptedInput(tokenAddress, owner, [{ type: "u64", value: 10_000n }]);
    await token.connect(owner).mint(business.address, mintAmount.handles[0], mintAmount.inputProof);

    const paymentAmount = await encryptedInput(tokenAddress, business, [{ type: "u64", value: 1_200n }]);
    const fieldsInput = await encryptedInput(tokenAddress, business, [
      { type: "u8", value: 6 },
      { type: "u8", value: 1 },
      { type: "u8", value: 0 },
    ]);

    await token.connect(business).confidentialTransferAndCallWithAudit(
      registryAddress,
      paymentAmount.handles[0],
      paymentAmount.inputProof,
      paymentFields(fieldsInput.handles, fieldsInput.inputProof, recipient.address, { jurisdictionCode: 2 }),
    );

    const handles = await registry.connect(auditor).getPaymentHandles(0);
    const clearAmount = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      handles[0],
      registryAddress,
      auditor as unknown as ethers.Signer,
    );

    expect(clearAmount).to.equal(1_200n);
  });
});
