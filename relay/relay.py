"""
Complyr V2 — Finding Relay
──────────────────────────
Watches TestEvaluated events on all RegisterTestRegistry contracts deployed via
ComplyrFactory and automatically calls recordFindingIfTriggeredFor() so auditors
never need to sign a transaction to create findings.

Designed to run as a Hugging Face Space (Gradio or plain Python SDK app).

Required HF Secrets (set in Space Settings → Repository Secrets):
  RELAY_PRIVATE_KEY   — private key of the relay wallet (0x0D96081998fd583334fd1757645B40fdD989B267)
  SEPOLIA_RPC_URL     — e.g. https://sepolia.infura.io/v3/YOUR_KEY
  FACTORY_ADDRESS     — 0xC50558268DD168734E79822b85a87Fce7BF0d453

Optional:
  POLL_INTERVAL_SECS  — seconds between polls (default: 30)
  START_BLOCK         — block to start scanning from on first run (default: factory deploy block)
"""

import os
import json
import time
import logging
import threading
from pathlib import Path

import gradio as gr
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware


# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("relay")

# ─── Config ───────────────────────────────────────────────────────────────────

RPC_URL          = os.environ["SEPOLIA_RPC_URL"]
RELAY_PRIVATE_KEY = os.environ["RELAY_PRIVATE_KEY"]
FACTORY_ADDRESS  = Web3.to_checksum_address(os.environ["FACTORY_ADDRESS"])
POLL_INTERVAL    = int(os.environ.get("POLL_INTERVAL_SECS", "5"))
# Block from which to start scanning on a fresh run (factory deploy block).
# Overridden if state file exists.
DEFAULT_START_BLOCK = int(os.environ.get("START_BLOCK", "11205602"))

STATE_FILE = Path("/tmp/relay_state.json")  # persists last-processed block between polls

# ─── ABIs (minimal — only what the relay needs) ───────────────────────────────

FACTORY_ABI = [
    {"inputs": [], "name": "businessCount", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"type": "uint256"}], "name": "businesses", "outputs": [{"type": "address"}], "stateMutability": "view", "type": "function"},
    {"inputs": [{"type": "address"}], "name": "registries",
     "outputs": [{"components": [
         {"name": "auditRegistry",     "type": "address"},
         {"name": "reviewTestRegistry","type": "address"},
         {"name": "active",            "type": "bool"},
         {"name": "deployedAtBlock",   "type": "uint256"},
     ], "type": "tuple"}],
     "stateMutability": "view", "type": "function"},
]

REVIEW_REGISTRY_ABI = [
    # recordFindingIfTriggeredFor(address auditor, uint256 paymentId, uint8 testType, bool triggered)
    {
        "inputs": [
            {"name": "auditor",   "type": "address"},
            {"name": "paymentId", "type": "uint256"},
            {"name": "testType",  "type": "uint8"},
            {"name": "triggered", "type": "bool"},
        ],
        "name": "recordFindingIfTriggeredFor",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

# TestEvaluated event topic0 — keccak256("TestEvaluated(address,uint256,uint8,bytes32)")
TEST_EVALUATED_TOPIC = Web3.keccak(
    text="TestEvaluated(address,uint256,uint8,bytes32)"
).hex()

# ─── State helpers ────────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_block": DEFAULT_START_BLOCK, "processed": []}

def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state))

# ─── Main relay loop ──────────────────────────────────────────────────────────

def main():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

    relay_account = w3.eth.account.from_key(RELAY_PRIVATE_KEY)
    log.info("Relay wallet : %s", relay_account.address)
    log.info("Factory      : %s", FACTORY_ADDRESS)

    factory = w3.eth.contract(address=FACTORY_ADDRESS, abi=FACTORY_ABI)
    state   = load_state()

    while True:
        try:
            latest_block = w3.eth.block_number
            from_block   = state["last_block"]

            if from_block > latest_block:
                log.info("No new blocks (latest=%d). Sleeping %ds.", latest_block, POLL_INTERVAL)
                time.sleep(POLL_INTERVAL)
                continue

            # ── Discover all active ReviewTestRegistry addresses ───────────────
            business_count = factory.functions.businessCount().call()
            registry_addresses: list[str] = []
            for i in range(business_count):
                biz    = factory.functions.businesses(i).call()
                reg    = factory.functions.registries(biz).call()
                active, review_addr = reg[2], reg[1]
                if active and review_addr != "0x" + "0" * 40:
                    registry_addresses.append(Web3.to_checksum_address(review_addr))

            if not registry_addresses:
                log.info("No active registries found. Sleeping.")
                time.sleep(POLL_INTERVAL)
                continue

            log.info(
                "Scanning blocks %d→%d across %d registry/ies",
                from_block, latest_block, len(registry_addresses),
            )

            # ── Fetch TestEvaluated logs for all registries in one call each ──
            # eth_getLogs per registry (batching across multiple addresses in one
            # call is not universally supported by free-tier providers).
            events_to_process: list[dict] = []
            for registry_addr in registry_addresses:
                logs = w3.eth.get_logs({
                    "address":   registry_addr,
                    "fromBlock": from_block,
                    "toBlock":   latest_block,
                    "topics":    [TEST_EVALUATED_TOPIC],
                })
                for raw_log in logs:
                    topics = raw_log["topics"]
                    # topics[0] = event sig, topics[1] = auditor, topics[2] = paymentId, topics[3] = testType
                    auditor    = Web3.to_checksum_address("0x" + topics[1].hex()[-40:])
                    payment_id = int(topics[2].hex(), 16)
                    test_type  = int(topics[3].hex(), 16)

                    # Skip SoD (testType 2) — goes through createSodFinding, no stored result
                    if test_type == 2:
                        continue

                    key = f"{registry_addr}:{auditor}:{payment_id}:{test_type}"
                    if key in state["processed"]:
                        continue  # already submitted

                    events_to_process.append({
                        "registry": registry_addr,
                        "auditor":  auditor,
                        "paymentId": payment_id,
                        "testType":  test_type,
                        "key":       key,
                    })

            log.info("%d new event(s) to process", len(events_to_process))

            # ── Submit recordFindingIfTriggeredFor for each new event ──────────
            for evt in events_to_process:
                registry_contract = w3.eth.contract(
                    address=Web3.to_checksum_address(evt["registry"]),
                    abi=REVIEW_REGISTRY_ABI,
                )
                try:
                    nonce = w3.eth.get_transaction_count(relay_account.address)
                    tx    = registry_contract.functions.recordFindingIfTriggeredFor(
                        evt["auditor"],
                        evt["paymentId"],
                        evt["testType"],
                        True,   # triggered — relay only submits for fired events
                    ).build_transaction({
                        "from":  relay_account.address,
                        "nonce": nonce,
                        "gas":   300_000,
                        "gasPrice": w3.eth.gas_price,
                    })
                    signed = relay_account.sign_transaction(tx)
                    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
                    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

                    if receipt["status"] == 1:
                        log.info(
                            "✅ Finding created — registry=%s auditor=%s paymentId=%d testType=%d tx=%s",
                            evt["registry"][:10], evt["auditor"][:10],
                            evt["paymentId"], evt["testType"], tx_hash.hex()[:16],
                        )
                        state["processed"].append(evt["key"])
                    else:
                        log.warning(
                            "⚠️  Tx reverted — %s (auditor=%s paymentId=%d testType=%d)",
                            tx_hash.hex()[:16], evt["auditor"][:10],
                            evt["paymentId"], evt["testType"],
                        )
                        # Don't mark as processed — will retry next poll.
                        # Common revert reason: _hasTestResult not set (test didn't actually
                        # store a result for this auditor — e.g. auditor was deregistered).

                except Exception as e:
                    log.error("Error processing event %s: %s", evt["key"], e)

            # Advance the scan window
            state["last_block"] = latest_block + 1
            save_state(state)

        except Exception as e:
            log.error("Poll cycle error: %s", e)

        log.info("Sleeping %ds until next poll.", POLL_INTERVAL)
        time.sleep(POLL_INTERVAL)


# ─── Gradio UI (required by HF Spaces to bind port 7860) ─────────────────────

def build_ui() -> gr.Blocks:
    with gr.Blocks(title="Complyr Relay") as demo:
        gr.Markdown(
            """
            # Complyr V2 — Finding Relay
            This Space runs a background process that watches `TestEvaluated` events
            on all active `ReviewTestRegistry` contracts and automatically submits
            `recordFindingIfTriggeredFor()` so auditors never need to sign manually.

            **Status: 🟢 Running** — check the container logs for polling activity.

            | Setting | Value |
            |---------|-------|
            | Poll interval | every 5s |
            | Network | Sepolia |
            | Factory | `0xC50558268DD168734E79822b85a87Fce7BF0d453` |
            """
        )
    return demo


if __name__ == "__main__":
    # Start the relay loop in a background daemon thread so it doesn't block Gradio
    relay_thread = threading.Thread(target=main, daemon=True, name="relay-loop")
    relay_thread.start()
    log.info("Relay thread started. Launching Gradio status UI on port 7860.")

    # Launch the Gradio UI — this is what HF Spaces needs to consider the app healthy
    build_ui().launch(server_name="0.0.0.0", server_port=7860)
