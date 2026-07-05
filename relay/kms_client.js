const { createInstance, SepoliaConfig } = require("@zama-fhe/relayer-sdk/node");
const { Wallet, JsonRpcProvider } = require("ethers");
const https = require("https");
const { URL } = require("url");

const DEBUG = !!process.env.KMS_DEBUG;

function dbg(...args) {
    if (DEBUG) console.error("[DEBUG]", ...args);
}

function normalizeHandle(value) {
    if (!value) {
        throw new Error("Missing ciphertext handle");
    }
    return value.startsWith("0x") ? value : `0x${value}`;
}

/**
 * Wraps the global fetch so that, in debug mode, we can see exactly what the
 * relayer-sdk sent and exactly what came back — including raw (non-JSON)
 * response bodies that would otherwise just surface as "Bad JSON".
 */
function installFetchDebugHook() {
    if (!DEBUG || typeof globalThis.fetch !== "function") return;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input?.url;
        const method = init?.method || "GET";
        let bodyPreview = "";
        if (init?.body) {
            bodyPreview = typeof init.body === "string" ? init.body : "[non-string body]";
            if (bodyPreview.length > 2000) bodyPreview = bodyPreview.slice(0, 2000) + "...[truncated]";
        }
        dbg(`--> fetch ${method} ${url}`);
        if (bodyPreview) dbg(`--> body: ${bodyPreview}`);

        let response;
        try {
            response = await originalFetch(input, init);
        } catch (networkErr) {
            // This is the case that matters most: fetch() itself failed before any
            // HTTP response existed (DNS failure, connection refused, TLS error,
            // timeout, egress/firewall block, etc). The SDK will typically swallow
            // this and report something generic like "Bad JSON" — this is the
            // actual root cause underneath that message.
            dbg(`XXX fetch to ${url} threw before receiving a response:`);
            dbg(`XXX message: ${networkErr.message}`);
            dbg(`XXX code: ${networkErr.code || networkErr.cause?.code || "(none)"}`);
            dbg(`XXX cause: ${networkErr.cause ? JSON.stringify(networkErr.cause, Object.getOwnPropertyNames(networkErr.cause)) : "(none)"}`);
            dbg(`XXX full error object: ${JSON.stringify(networkErr, Object.getOwnPropertyNames(networkErr))}`);
            throw networkErr;
        }

        // Clone so we can read the body for logging without consuming the
        // stream the SDK still needs to read itself.
        const cloned = response.clone();
        let text = "";
        try {
            text = await cloned.text();
        } catch (readErr) {
            text = `[could not read body: ${readErr.message}]`;
        }
        const preview = text.length > 2000 ? text.slice(0, 2000) + "...[truncated]" : text;
        dbg(`<-- status ${response.status} ${response.statusText} for ${url}`);
        dbg(`<-- raw response body: ${preview || "[empty]"}`);

        return response;
    };
}

/**
 * Raw TCP/TLS-level connectivity check using Node's https module directly,
 * completely independent of fetch/undici and the relayer-sdk. If this also
 * fails, the problem is definitely network/egress-level (DNS, firewall,
 * proxy, blocked domain) rather than anything in the SDK or our fetch hook.
 */
function rawConnectivityCheck(targetUrl) {
    return new Promise((resolve) => {
        const parsed = new URL(targetUrl);
        const req = https.request(
            {
                hostname: parsed.hostname,
                port: 443,
                path: "/",
                method: "GET",
                timeout: 8000,
            },
            (res) => {
                dbg(`RAW CHECK: connected to ${parsed.hostname}, got HTTP status ${res.statusCode}`);
                res.resume();
                resolve({ ok: true, status: res.statusCode });
            }
        );
        req.on("timeout", () => {
            dbg(`RAW CHECK: timed out connecting to ${parsed.hostname}`);
            req.destroy();
            resolve({ ok: false, reason: "timeout" });
        });
        req.on("error", (err) => {
            dbg(`RAW CHECK: error connecting to ${parsed.hostname}: ${err.message} (code: ${err.code || "none"})`);
            resolve({ ok: false, reason: err.message, code: err.code });
        });
        req.end();
    });
}

async function main() {
    // Usage:
    // RELAY_PRIVATE_KEY=... [KMS_DEBUG=1] node kms_client.js <handle_hex> <contract_address> <user_address> <rpc_url> [relayer_url]
    const handleArg = process.argv[2];
    const contractAddress = process.argv[3];
    const userAddress = process.argv[4];
    const rpcUrl = process.argv[5];
    // Optional override; defaults to Zama's current Sepolia relayer.
    const relayerUrl = process.argv[6] || "https://relayer.testnet.zama.org";
    const relayPrivateKey = process.env.RELAY_PRIVATE_KEY;

    if (!handleArg || !contractAddress || !userAddress || !rpcUrl || !relayPrivateKey) {
        console.error("Missing arguments.");
        process.exit(1);
    }

    installFetchDebugHook();

    dbg("argv:", { handleArg, contractAddress, userAddress, rpcUrl, relayerUrl });

    if (DEBUG) {
        const check = await rawConnectivityCheck(relayerUrl);
        dbg("raw connectivity check result:", check);
    }

    try {
        const handle = normalizeHandle(handleArg);
        dbg("normalized handle:", handle, "length:", handle.length);

        const provider = new JsonRpcProvider(rpcUrl);
        const wallet = new Wallet(relayPrivateKey, provider);
        dbg("wallet address:", wallet.address);

        if (wallet.address.toLowerCase() !== userAddress.toLowerCase()) {
            throw new Error(`Relay private key does not match user address ${userAddress}`);
        }

        // Sanity checks that commonly explain a malformed/rejected request
        // before we even get to the network call.
        if (!/^0x[0-9a-fA-F]{64}$/.test(handle)) {
            dbg(`WARNING: handle does not look like a full 32-byte (64 hex char) value: ${handle}`);
        }
        if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
            dbg(`WARNING: contractAddress does not look like a valid 20-byte address: ${contractAddress}`);
        }

        const instanceConfig = {
            ...SepoliaConfig,
            network: rpcUrl,
            relayerUrl,
        };
        dbg("createInstance config (minus provider):", {
            aclContractAddress: instanceConfig.aclContractAddress,
            kmsContractAddress: instanceConfig.kmsContractAddress,
            inputVerifierContractAddress: instanceConfig.inputVerifierContractAddress,
            verifyingContractAddressDecryption: instanceConfig.verifyingContractAddressDecryption,
            verifyingContractAddressInputVerification: instanceConfig.verifyingContractAddressInputVerification,
            chainId: instanceConfig.chainId,
            gatewayChainId: instanceConfig.gatewayChainId,
            network: instanceConfig.network,
            relayerUrl: instanceConfig.relayerUrl,
        });

        const instance = await createInstance(instanceConfig);
        dbg("instance created OK");

        const { publicKey, privateKey } = instance.generateKeypair();
        dbg("generated ephemeral keypair, publicKey:", publicKey);

        const startTimestamp = Math.floor(Date.now() / 1000);
        const durationDays = 1;
        dbg("startTimestamp:", startTimestamp, "durationDays:", durationDays);

        const eip712 = instance.createEIP712(
            publicKey,
            [contractAddress],
            startTimestamp,
            durationDays
        );
        dbg("EIP712 domain:", eip712.domain);
        dbg("EIP712 primaryType/message:", eip712.primaryType, eip712.message);

        const types = { ...eip712.types };
        delete types.EIP712Domain;

        const rawSignature = await wallet.signTypedData(eip712.domain, types, eip712.message);
        dbg("raw signature (with 0x):", rawSignature);

        // The relayer expects the signature WITHOUT the 0x prefix — sending it with the
        // prefix still attached is a known cause of "Bad JSON" / malformed-request errors.
        const signature = rawSignature.replace(/^0x/, "");
        dbg("signature length after stripping 0x:", signature.length, "(expect 130 hex chars)");

        let result;
        try {
            result = await instance.userDecrypt(
                [{ handle, contractAddress }],
                privateKey,
                publicKey,
                signature,
                [contractAddress],
                userAddress,
                startTimestamp,
                durationDays
            );
            dbg("userDecrypt raw result:", result);
        } catch (innerErr) {
            // Surface everything we can about the failure — message, stack,
            // and any nested cause/response fields the SDK or fetch attached.
            console.error("DEBUG userDecrypt failure message:", innerErr.message);
            if (innerErr.stack) console.error("DEBUG stack:", innerErr.stack);
            if (innerErr.cause) console.error("DEBUG cause:", innerErr.cause);
            if (innerErr.response) {
                try {
                    console.error("DEBUG response status:", innerErr.response.status);
                    console.error("DEBUG response data:", JSON.stringify(innerErr.response.data));
                } catch (_) { /* best effort */ }
            }
            throw innerErr;
        }

        const plaintext = result[handle];
        dbg("plaintext for handle:", plaintext, typeof plaintext);
        console.log("RESULT:" + (plaintext === 0n || plaintext === false ? "false" : "true"));
    } catch (e) {
        console.error("ERROR:" + e.message);
        process.exit(1);
    }
}

main();