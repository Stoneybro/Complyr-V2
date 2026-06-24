import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

const ZERO_BYTES32 = ethers.ZeroHash;

enum TestType {
  LARGE_PAYMENT,
  PURPOSE_EXPOSURE,
  RISK_TIER_SPIKE,
  JURISDICTION_EXPOSURE,
  RECIPIENT_EXPOSURE,
  COUNTERPARTY_PATTERN,
}

enum Priority {
  NONE,
  MONITORING,
  STANDARD,
  CRITICAL,
}

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
  const [owner, business, recipient, auditor, outsider, secondAuditor] = await hre.ethers.getSigners();

  const tokenFactory = await hre.ethers.getContractFactory("ConfidentialUSDC");
  const token = await tokenFactory.connect(owner).deploy();
  await token.waitForDeployment();

  const registryFactory = await hre.ethers.getContractFactory("AuditRegistry");
  const registry = await registryFactory.connect(owner).deploy(await token.getAddress());
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  const reviewTestFactory = await hre.ethers.getContractFactory("ReviewTestRegistry");
  const reviewTestRegistry = await reviewTestFactory.connect(owner).deploy(registryAddress);
  await reviewTestRegistry.waitForDeployment();
  const reviewTestAddress = await reviewTestRegistry.getAddress();

  await registry.connect(owner).setReviewTestRegistry(reviewTestAddress);
  await registry.connect(owner).setAuditorAccess(reviewTestAddress, 3);
  await registry.connect(owner).setAuditorAccess(auditor.address, 3);
  await registry.connect(owner).setAuditorAccess(secondAuditor.address, 2);

  await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialUSDC");
  await hre.fhevm.assertCoprocessorInitialized(registry, "AuditRegistry");
  await hre.fhevm.assertCoprocessorInitialized(reviewTestRegistry, "ReviewTestRegistry");

  const thresholds = await encryptedInput(registryAddress, auditor, [
    { type: "u64", value: 1_000n },
    { type: "u64", value: 5_000n },
    { type: "u64", value: 10_000n },
  ]);
  await registry
    .connect(auditor)
    .setAuthTierThresholds(thresholds.handles[0], thresholds.handles[1], thresholds.handles[2], thresholds.inputProof);

  return {
    owner,
    business,
    recipient,
    auditor,
    outsider,
    secondAuditor,
    registry,
    registryAddress,
    reviewTestRegistry,
    reviewTestAddress,
  };
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

async function createReviewTest(
  reviewTestRegistry: any,
  reviewTestAddress: string,
  auditor: HardhatEthersSigner,
  testType: TestType,
  threshold: bigint,
  priority: Priority = Priority.CRITICAL,
  scope = 0,
  monitoringFrequency = 0,
) {
  const input = await encryptedInput(reviewTestAddress, auditor, [{ type: "u64", value: threshold }]);
  await reviewTestRegistry
    .connect(auditor)
    .createTest(testType, scope, input.handles[0], input.inputProof, priority, monitoringFrequency);
}

async function recordPayment(
  registry: any,
  registryAddress: string,
  business: HardhatEthersSigner,
  recipient: string,
  amountValue: bigint,
  purposeCode: number,
  riskTier: number,
  counterpartyType: number,
  jurisdictionCode = 0,
) {
  const amount = await encryptedInput(registryAddress, business, [{ type: "u64", value: amountValue }]);
  const fields = await encryptedInput(registryAddress, business, [
    { type: "u8", value: purposeCode },
    { type: "u8", value: riskTier },
    { type: "u8", value: counterpartyType },
  ]);

  await registry
    .connect(business)
    .recordPayment(
      amount.handles[0],
      amount.inputProof,
      paymentFields(fields.handles, fields.inputProof, recipient, { jurisdictionCode }),
    );
}

async function decryptResult(
  reviewTestRegistry: any,
  reviewTestAddress: string,
  auditor: HardhatEthersSigner,
  paymentId: number,
  testType: TestType,
) {
  const handle = await reviewTestRegistry.connect(auditor).getTestResult(auditor.address, paymentId, testType);
  return hre.fhevm.userDecryptEbool(handle, reviewTestAddress, auditor as unknown as ethers.Signer);
}

describe("ReviewTestRegistry", function () {
  it("requires AuditRegistry-approved auditors to create tests", async function () {
    const { outsider, reviewTestRegistry, reviewTestAddress } = await deployFixture();

    const input = await encryptedInput(reviewTestAddress, outsider, [{ type: "u64", value: 5_000n }]);
    await expect(
      reviewTestRegistry
        .connect(outsider)
        .createTest(TestType.LARGE_PAYMENT, 0, input.handles[0], input.inputProof, Priority.CRITICAL, 0),
    ).to.be.revertedWithCustomError(reviewTestRegistry, "Unauthorized");
  });

  it("validates test type, scope, priority, and monitoring frequency", async function () {
    const { auditor, reviewTestRegistry, reviewTestAddress } = await deployFixture();
    const input = await encryptedInput(reviewTestAddress, auditor, [{ type: "u64", value: 5_000n }]);

    await expect(
      reviewTestRegistry.connect(auditor).createTest(99, 0, input.handles[0], input.inputProof, Priority.CRITICAL, 0),
    ).to.be.revertedWithCustomError(reviewTestRegistry, "InvalidTestType");

    await expect(
      reviewTestRegistry
        .connect(auditor)
        .createTest(TestType.PURPOSE_EXPOSURE, 12, input.handles[0], input.inputProof, Priority.CRITICAL, 0),
    ).to.be.revertedWithCustomError(reviewTestRegistry, "InvalidScope");

    await expect(
      reviewTestRegistry
        .connect(auditor)
        .createTest(TestType.LARGE_PAYMENT, 0, input.handles[0], input.inputProof, Priority.MONITORING, 0),
    ).to.be.revertedWithCustomError(reviewTestRegistry, "InvalidFrequency");
  });

  it("evaluates LARGE_PAYMENT for false and true encrypted results", async function () {
    const { business, recipient, auditor, registry, registryAddress, reviewTestRegistry, reviewTestAddress } =
      await deployFixture();

    await createReviewTest(reviewTestRegistry, reviewTestAddress, auditor, TestType.LARGE_PAYMENT, 5_000n);
    await recordPayment(registry, registryAddress, business, recipient.address, 4_000n, 1, 0, 0);
    await recordPayment(registry, registryAddress, business, recipient.address, 6_000n, 1, 0, 0);

    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 0, TestType.LARGE_PAYMENT)).to.equal(
      false,
    );
    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 1, TestType.LARGE_PAYMENT)).to.equal(true);
  });

  it("evaluates scoped PURPOSE_EXPOSURE and COUNTERPARTY_PATTERN totals", async function () {
    const { business, recipient, auditor, registry, registryAddress, reviewTestRegistry, reviewTestAddress } =
      await deployFixture();

    await createReviewTest(reviewTestRegistry, reviewTestAddress, auditor, TestType.PURPOSE_EXPOSURE, 2_000n, Priority.CRITICAL, 4);
    await createReviewTest(
      reviewTestRegistry,
      reviewTestAddress,
      auditor,
      TestType.COUNTERPARTY_PATTERN,
      2_000n,
      Priority.CRITICAL,
      1,
    );

    await recordPayment(registry, registryAddress, business, recipient.address, 2_500n, 4, 0, 1);

    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 0, TestType.PURPOSE_EXPOSURE)).to.equal(
      true,
    );
    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 0, TestType.COUNTERPARTY_PATTERN)).to.equal(
      true,
    );
  });

  it("evaluates RISK_TIER_SPIKE across HIGH and WATCHLIST totals", async function () {
    const { business, recipient, auditor, registry, registryAddress, reviewTestRegistry, reviewTestAddress } =
      await deployFixture();

    await createReviewTest(reviewTestRegistry, reviewTestAddress, auditor, TestType.RISK_TIER_SPIKE, 7_000n);
    await recordPayment(registry, registryAddress, business, recipient.address, 4_000n, 1, 2, 0, 3);
    await recordPayment(registry, registryAddress, business, recipient.address, 4_000n, 1, 0, 0, 4);

    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 0, TestType.RISK_TIER_SPIKE)).to.equal(
      false,
    );
    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 1, TestType.RISK_TIER_SPIKE)).to.equal(true);
  });

  it("evaluates jurisdiction and recipient exposure", async function () {
    const { business, recipient, auditor, registry, registryAddress, reviewTestRegistry, reviewTestAddress } =
      await deployFixture();

    await createReviewTest(reviewTestRegistry, reviewTestAddress, auditor, TestType.JURISDICTION_EXPOSURE, 3_000n);
    await createReviewTest(reviewTestRegistry, reviewTestAddress, auditor, TestType.RECIPIENT_EXPOSURE, 5_000n);

    await recordPayment(registry, registryAddress, business, recipient.address, 2_500n, 1, 0, 0, 2);
    await recordPayment(registry, registryAddress, business, recipient.address, 3_000n, 1, 0, 0, 2);

    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 0, TestType.JURISDICTION_EXPOSURE)).to.equal(
      false,
    );
    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 1, TestType.JURISDICTION_EXPOSURE)).to.equal(
      true,
    );
    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 1, TestType.RECIPIENT_EXPOSURE)).to.equal(
      true,
    );
  });

  it("runs MONITORING tests only on the configured recipient cadence", async function () {
    const { business, recipient, auditor, registry, registryAddress, reviewTestRegistry, reviewTestAddress } =
      await deployFixture();

    await createReviewTest(
      reviewTestRegistry,
      reviewTestAddress,
      auditor,
      TestType.RECIPIENT_EXPOSURE,
      1_000n,
      Priority.MONITORING,
      0,
      2,
    );

    await recordPayment(registry, registryAddress, business, recipient.address, 1_500n, 1, 0, 0);
    await recordPayment(registry, registryAddress, business, recipient.address, 1_500n, 1, 0, 0);

    await expect(
      reviewTestRegistry.connect(auditor).getTestResult(auditor.address, 0, TestType.RECIPIENT_EXPOSURE),
    ).to.be.reverted;
    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 1, TestType.RECIPIENT_EXPOSURE)).to.equal(
      true,
    );
  });

  it("restricts encrypted result reads to the owning auditor or owner", async function () {
    const { business, recipient, auditor, outsider, registry, registryAddress, reviewTestRegistry, reviewTestAddress } =
      await deployFixture();

    await createReviewTest(reviewTestRegistry, reviewTestAddress, auditor, TestType.LARGE_PAYMENT, 1_000n);
    await recordPayment(registry, registryAddress, business, recipient.address, 2_000n, 1, 0, 0);

    await expect(
      reviewTestRegistry.connect(outsider).getTestResult(auditor.address, 0, TestType.LARGE_PAYMENT),
    ).to.be.revertedWithCustomError(reviewTestRegistry, "Unauthorized");

    expect(await decryptResult(reviewTestRegistry, reviewTestAddress, auditor, 0, TestType.LARGE_PAYMENT)).to.equal(true);
  });
});
