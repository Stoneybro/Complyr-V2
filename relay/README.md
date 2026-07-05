# Complyr V2 — Finding Relay (HF Space)

Watches `TestEvaluated` events on all `ReviewTestRegistry` contracts deployed via `ComplyrFactory` and automatically calls `recordFindingIfTriggeredFor()`. Auditors get findings automatically — no wallet interaction needed.

## HF Space Setup

1. Create a new **Hugging Face Space** → SDK: **Docker** or **Gradio** (pick Gradio, then replace `app.py` with `relay.py` contents, rename it `app.py`)
2. Set **Repository Secrets** in Space Settings:

| Secret | Value |
|--------|-------|
| `RELAY_PRIVATE_KEY` | (your relay wallet private key — never commit this) |
| `SEPOLIA_RPC_URL` | `https://sepolia.infura.io/v3/YOUR_KEY` |
| `FACTORY_ADDRESS` | `0xC50558268DD168734E79822b85a87Fce7BF0d453` |

3. Upload `relay.py` as `app.py` and `requirements.txt`
4. The Space will install dependencies and start the polling loop

## How it works

```
Payment sent
  └─▶ AuditRegistry.onConfidentialTransferReceived()
        └─▶ ReviewTestRegistry.evaluateAll()
              └─▶ TestEvaluated event emitted  ← relay picks this up
                    └─▶ relay calls recordFindingIfTriggeredFor(auditor, paymentId, testType, true)
                          └─▶ Finding appears in auditor portal (~30s lag)
```

## Notes

- The relay polls every 30 seconds (configurable via `POLL_INTERVAL_SECS`)
- Processed events are tracked in `/tmp/relay_state.json` — resets on Space restart but the `last_block` cursor prevents re-processing (events before restart are already committed on-chain)
- `testType == 2` (SoD) is skipped — those findings are created directly by `createSodFinding()` in the same tx as the approval
- If a tx reverts (e.g. auditor was de-registered after the event fired), the event is NOT marked as processed and will retry next poll

