"""
Complyr V2 — Finding Relay
──────────────────────────
Watches TestEvaluated events on all RegisterTestRegistry contracts deployed via
ComplyrFactory and automatically calls recordFindingIfTriggeredFor().
"""

import os
import json
import time
import threading
import re
import subprocess
from pathlib import Path
from datetime import datetime

import gradio as gr
from web3 import Web3

# ─── Constants ───────────────────────────────────────────────────────────────

POLL_INTERVAL       = int(os.environ.get("POLL_INTERVAL_SECS", "5"))
DEFAULT_START_BLOCK = int(os.environ.get("START_BLOCK", "11205602"))
MAX_BLOCK_RANGE     = int(os.environ.get("MAX_BLOCK_RANGE", "100"))  # Alchemy eth_getLogs limit
ARCHIVE_SKIP_THRESHOLD = 2000  # If we're this many blocks behind, skip to current (archive restriction)
STATE_FILE          = Path("/tmp/relay_state.json")
LOG_FILE            = Path("/tmp/relay_logs.txt")
SCRIPT_DIR          = Path(__file__).resolve().parent

CHAIN_ID            = int(os.environ.get("CHAIN_ID", "11155111"))
FHEVM_RELAYER_URL   = os.environ.get("FHEVM_RELAYER_URL", "https://relayer.testnet.zama.org").strip()

# Ensure log file exists
if not LOG_FILE.exists():
    LOG_FILE.write_text("Relay logs initialized...\n")

# ─── Custom Logger (Prints + Writes to file for UI) ──────────────────────────

def log(level: str, message: str):
    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"{timestamp} [{level}] {message}"
    
    # 1. Print directly to stdout with flush=True (bypasses logging module quirks)
    print(line, flush=True)
    
    # 2. Append to log file for Gradio UI to read (keep last 100 lines)
    try:
        lines = LOG_FILE.read_text().splitlines()
        lines.append(line)
        LOG_FILE.write_text("\n".join(lines[-100:]))
    except Exception as e:
        print(f"Failed to write log to file: {e}", flush=True)

# ─── ABIs (minimal) ─────────────────────────────────────────────────────────

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

TEST_EVALUATED_TOPIC = Web3.keccak(text="TestEvaluated(address,uint256,uint8,bytes32)").hex()

# ─── State helpers ────────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_block": DEFAULT_START_BLOCK, "processed": []}

def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state))

def hexstr(value) -> str:
    if hasattr(value, "hex"):
        value = value.hex()
    value = str(value)
    return value if value.startswith("0x") else f"0x{value}"

def parse_kms_stdout(output: str) -> bool:
    for line in output.splitlines():
        match = re.fullmatch(r"RESULT:(true|false)", line.strip())
        if match:
            return match.group(1) == "true"
    raise ValueError(f"Unexpected KMS output: {output!r}")

def send_finding_tx(w3, relay_account, registry_contract, evt, get_next_nonce, log):
    """
    get_next_nonce: a zero-arg callable that returns the next nonce to use
    and advances an in-memory counter — see the closure set up below.
    Returns True on confirmed success, False on failure (caller keeps
    poll_had_retryable_failure = True in that case, same as before).
    """
    MAX_ATTEMPTS = 3
    nonce = get_next_nonce()

    base_fee = w3.eth.get_block("pending")["baseFeePerGas"]
    # Priority fee with headroom; bump further on each retry attempt.
    priority_fee = w3.to_wei(2, "gwei")

    attempt = 0
    while attempt < MAX_ATTEMPTS:
        attempt += 1
        # Escalate both base-fee headroom and priority fee on each retry so a
        # resend is a valid fee-bump replacement, not just a duplicate.
        max_priority = priority_fee * attempt
        max_fee = base_fee * 2 * attempt + max_priority

        try:
            tx = registry_contract.functions.recordFindingIfTriggeredFor(
                evt["auditor"],
                evt["paymentId"],
                evt["testType"],
                True,
            ).build_transaction({
                "from": relay_account.address,
                "nonce": nonce,
                "gas": 300_000,
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": max_priority,
            })
            signed = relay_account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            log("INFO", f"Sent tx {tx_hash.hex()} (nonce={nonce}, attempt={attempt}, maxFeePerGas={max_fee})")

            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=90)

            if receipt["status"] == 1:
                log("INFO", f"Finding created - auditor={evt['auditor']} paymentId={evt['paymentId']} "
                             f"testType={evt['testType']} tx={tx_hash.hex()}")
                return True
            else:
                log("WARNING", f"Tx reverted - paymentId={evt['paymentId']} (auditor may be deregistered)")
                return False  # revert is not a gas problem — don't retry with more gas

        except Exception as e:
            err_str = str(e)
            if "TimeExhausted" in err_str or "not in the chain" in err_str:
                log("WARNING", f"Tx for paymentId={evt['paymentId']} not mined within timeout "
                                f"(attempt {attempt}/{MAX_ATTEMPTS}). Retrying at same nonce with higher gas.")
                continue  # same nonce, higher fee next loop iteration = replacement
            log("ERROR", f"[sendTx failed] {evt['key']}: {type(e).__name__}: {e}")
            return False

    log("ERROR", f"[sendTx failed] {evt['key']}: exhausted {MAX_ATTEMPTS} attempts, still not mined.")
    return False

# ─── Main relay loop ──────────────────────────────────────────────────────────

def run_relay():
    log("INFO", "Relay thread is starting...")
    
    # Strip any accidental newlines or whitespace (like %0a from copy/paste)
    rpc_url           = os.environ.get("SEPOLIA_RPC_URL", "").strip()
    relay_private_key = os.environ.get("RELAY_PRIVATE_KEY", "").strip()
    factory_address   = os.environ.get("FACTORY_ADDRESS", "").strip()

    if not all([rpc_url, relay_private_key, factory_address]):
        log("ERROR", "Missing secrets! Please add SEPOLIA_RPC_URL, RELAY_PRIVATE_KEY, and FACTORY_ADDRESS")
        return

    try:
        factory_address = Web3.to_checksum_address(factory_address)
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        relay_account = w3.eth.account.from_key(relay_private_key)
        
        log("INFO", f"Relay wallet : {relay_account.address}")
        log("INFO", f"Factory      : {factory_address}")
        log("INFO", f"Poll interval: {POLL_INTERVAL}s")
        log("INFO", f"FHEVM Relayer: {FHEVM_RELAYER_URL}")

        factory = w3.eth.contract(address=factory_address, abi=FACTORY_ABI)
        state   = load_state()

        # If we're far behind the chain tip, skip archive history (Alchemy free tier blocks it)
        try:
            current_tip = w3.eth.block_number
            blocks_behind = current_tip - state["last_block"]
            if blocks_behind > ARCHIVE_SKIP_THRESHOLD:
                log("WARNING", f"State is {blocks_behind} blocks behind (last={state['last_block']}, tip={current_tip}). Skipping to tip to avoid archive restriction.")
                state["last_block"] = current_tip
                save_state(state)
        except Exception:
            pass  # Will be caught in the poll loop

    except Exception as e:
        log("ERROR", f"Failed to initialize Web3/Contracts: {e}")
        return

    while True:
        try:
            # --- Step 1: Get latest block ---
            try:
                latest_block = w3.eth.block_number
            except Exception as e:
                log("ERROR", f"[eth_blockNumber failed] {type(e).__name__}: {e}")
                time.sleep(POLL_INTERVAL)
                continue

            from_block = state["last_block"]

            if from_block > latest_block:
                log("INFO", f"No new blocks (latest={latest_block}). Sleeping...")
                time.sleep(POLL_INTERVAL)
                continue

            # --- Step 2: Read factory ---
            try:
                business_count = factory.functions.businessCount().call()
            except Exception as e:
                log("ERROR", f"[businessCount() failed] {type(e).__name__}: {e}")
                time.sleep(POLL_INTERVAL)
                continue

            registry_addresses: list[str] = []
            for i in range(business_count):
                try:
                    biz = factory.functions.businesses(i).call()
                    reg = factory.functions.registries(biz).call()
                    active, review_addr = reg[2], reg[1]
                    if active and review_addr != "0x" + "0" * 40:
                        registry_addresses.append(Web3.to_checksum_address(review_addr))
                except Exception as e:
                    log("ERROR", f"[registries({i}) failed] {type(e).__name__}: {e}")

            if not registry_addresses:
                log("INFO", "No active registries found. Sleeping.")
                time.sleep(POLL_INTERVAL)
                continue

            log("INFO", f"Scanning blocks {from_block}-{latest_block} across {len(registry_addresses)} registry/ies")

            # --- Step 3: Fetch logs in chunks ---
            events_to_process: list[dict] = []
            poll_had_retryable_failure = False
            for registry_addr in registry_addresses:
                chunk_start = from_block
                while chunk_start <= latest_block:
                    chunk_end = min(chunk_start + MAX_BLOCK_RANGE - 1, latest_block)
                    try:
                        raw_logs = w3.eth.get_logs({
                            "address":   registry_addr,
                            "fromBlock": chunk_start,
                            "toBlock":   chunk_end,
                            "topics":    [TEST_EVALUATED_TOPIC],
                        })
                    except Exception as e:
                        err_str = str(e)
                        if "400" in err_str or "Bad Request" in err_str:
                            # Likely an Alchemy archive restriction — skip this chunk
                            log("WARNING", f"[eth_getLogs blocks={chunk_start}-{chunk_end}] Archive block restricted (400). Skipping chunk.")
                        else:
                            log("ERROR", f"[eth_getLogs blocks={chunk_start}-{chunk_end}] {type(e).__name__}: {e}")
                        chunk_start = chunk_end + 1
                        continue

                    for raw_log in raw_logs:
                        topics = raw_log["topics"]
                        auditor    = Web3.to_checksum_address("0x" + topics[1].hex()[-40:])
                        payment_id = int(topics[2].hex(), 16)
                        test_type  = int(topics[3].hex(), 16)

                        if test_type == 2:
                            continue
                        if test_type == 1:
                            log("INFO", f"Skipping AUTHORIZATION_BREACH event for paymentId={payment_id}; it uses the payment-scoped auth-breach flow, not auditor-scoped relay findings.")
                            continue

                        tx_hash = hexstr(raw_log["transactionHash"])
                        log_index = int(raw_log["logIndex"])
                        ebool_handle = hexstr(raw_log["data"])

                        key = f"{registry_addr}:{tx_hash}:{log_index}"
                        if key in state["processed"]:
                            continue

                        events_to_process.append({
                            "registry": registry_addr,
                            "auditor":  auditor,
                            "paymentId": payment_id,
                            "testType":  test_type,
                            "result":    ebool_handle,
                            "blockNumber": int(raw_log["blockNumber"]),
                            "key":       key,
                        })
                    chunk_start = chunk_end + 1

            if events_to_process:
                log("INFO", f"{len(events_to_process)} new event(s) to process")

            # --- Step 4: Send transactions ---
            if events_to_process:
                pending_nonce = w3.eth.get_transaction_count(relay_account.address, "pending")
                def get_next_nonce():
                    nonlocal pending_nonce
                    n = pending_nonce
                    pending_nonce += 1
                    return n

            for evt in events_to_process:
                log("INFO", f"Processing: auditor={evt['auditor']} paymentId={evt['paymentId']} testType={evt['testType']}")
                registry_contract = w3.eth.contract(
                    address=Web3.to_checksum_address(evt["registry"]),
                    abi=REVIEW_REGISTRY_ABI,
                )

                # Fetch encrypted handle for this test evaluation
                ebool_handle = evt["result"]

                log("INFO", f"Requesting KMS decryption for handle {ebool_handle[:12]}...")
                try:
                    kms_env = os.environ.copy()
                    kms_env["RELAY_PRIVATE_KEY"] = relay_private_key
                    kms_env["KMS_DEBUG"] = "1"
                    result = subprocess.run([
                        "node", "kms_client.js",
                        ebool_handle,
                        evt["registry"],
                        relay_account.address,
                        rpc_url,
                        FHEVM_RELAYER_URL,
                    ], capture_output=True, text=True, check=True, cwd=SCRIPT_DIR, env=kms_env, timeout=120)
                    
                    is_triggered = parse_kms_stdout(result.stdout)
                    
                    log("INFO", f"KMS Decryption success: triggered={is_triggered}")
                except subprocess.CalledProcessError as e:
                    details = (e.stderr or e.stdout or str(e)).strip()
                    log("ERROR", f"KMS Decryption failed for {evt['key']}: {details}")
                    poll_had_retryable_failure = True
                    continue
                except Exception as e:
                    log("ERROR", f"KMS Decryption failed for {evt['key']}: {type(e).__name__}: {e}")
                    poll_had_retryable_failure = True
                    continue

                if not is_triggered:
                    log("INFO", f"Test did not trigger (false). Skipping finding creation.")
                    state["processed"].append(evt["key"])
                    continue

                ok = send_finding_tx(w3, relay_account, registry_contract, evt, get_next_nonce, log)
                if ok:
                    state["processed"].append(evt["key"])
                else:
                    poll_had_retryable_failure = True

            if poll_had_retryable_failure:
                log("WARNING", "One or more events failed before final processing. Keeping block cursor unchanged so they retry.")
            else:
                state["last_block"] = latest_block + 1
                if len(state["processed"]) > 5000:
                    state["processed"] = state["processed"][-5000:]
            save_state(state)

        except Exception as e:
            log("ERROR", f"[Unhandled poll error] {type(e).__name__}: {e}")

        time.sleep(POLL_INTERVAL)


# ─── Start Background Thread ──────────────────────────────────────────────────

log("INFO", "Initializing Node.js dependencies for KMS client...")
try:
    subprocess.run(["npm", "install"], cwd=SCRIPT_DIR, check=True, capture_output=True)
    log("INFO", "Node dependencies installed successfully.")
except Exception as e:
    log("ERROR", f"Failed to install Node dependencies: {e}")

relay_thread = threading.Thread(target=run_relay, daemon=True, name="relay-loop")
relay_thread.start()
log("INFO", "Gradio app starting...")

# ─── Gradio UI ───────────────────────────────────────────────────────────────

def read_logs():
    try:
        return LOG_FILE.read_text()
    except Exception:
        return "No logs yet..."

with gr.Blocks(title="Complyr Relay") as demo:
    gr.Markdown("# Complyr V2 — Finding Relay")
    gr.Markdown("**Status: 🟢 Running** — Watching for `TestEvaluated` events automatically.")
    
    with gr.Row():
        with gr.Column():
            gr.Markdown(f"**Network:** Sepolia\n**Poll Interval:** {POLL_INTERVAL}s")
        with gr.Column():
            gr.Markdown("**Live Logs:** (Auto-updates every 3s)")

    log_box = gr.Textbox(
        value=read_logs,
        every=3,  # Gradio feature: calls read_logs() every 3 seconds to update the UI
        lines=15,
        max_lines=15,
        show_label=False,
        interactive=False,
        elem_id="log-box",
    )

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
