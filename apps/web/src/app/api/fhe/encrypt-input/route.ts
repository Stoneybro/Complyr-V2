import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, category } = body;

    // Simulate FHE encryption delay (Zama coprocessor network round-trip)
    await new Promise((r) => setTimeout(r, 1000));

    // Generate stable mock ciphertexts for the demo.
    // In production: use fhevmjs / Zama SDK to encrypt client-side or via coprocessor.
    const mockEncrypt = (val: string | number) =>
      "0x" + Buffer.from(String(val)).toString("hex").padStart(64, "0");

    return NextResponse.json({
      // Encrypted amount handle (euint64)
      encryptedAmount: amount ? mockEncrypt(amount) : null,
      inputProof: "0xdeadbeef", // Mock proof for amount

      // Encrypted GL category handle (euint8) — matches ExternalAuditFields.category
      encryptedCategory: category !== undefined ? mockEncrypt(category) : null,
      // inputProof is shared for both in the mock; in production each field needs its own proof
    });
  } catch (error) {
    console.error("Encryption error", error);
    return NextResponse.json({ error: "Failed to encrypt" }, { status: 500 });
  }
}
