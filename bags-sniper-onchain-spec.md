# Bags.fun Claim Sniper — Final Build Docs (On-chain First)

## Core decision (important)

We are **NOT** relying on the Bags HTTP API for real-time detection.

- ❌ No high-frequency HTTP polling
- ❌ No proxies
- ❌ No IP rotation
- ❌ No rate-limit games

Instead:

✅ **Primary trigger = on-chain detection via Yellowstone gRPC (Geyser)**  
✅ **Bags API = optional / secondary (UI, enrichment, verification only)**

This gives us **sub-second detection** and removes all rate-limit constraints.

---

## High-level flow (actual final design)

1) User logs in with **Privy**
2) User creates a wallet (optionally exports private key)
3) User funds wallet with SOL
4) User configures buy settings
5) User pastes one or more token mints (CAs)
6) Backend:
   - listens to Solana **in real time**
   - detects **Bags claim transactions**
7) The **moment a claim tx hits the chain**:
   - backend executes buy tx immediately
8) UI updates + optional Telegram notification

---

## Claim detection strategy (A with B fallback)

We use **two-layer detection**:

---

### Strategy A — Direct mint match (first choice)

**What we do**
- Subscribe (via Yellowstone gRPC) to transactions invoking:
  - **Bags Fee Share V2 program**
- Decode instructions using the Bags IDL
- Check if the **token mint (CA)** is directly present in the instruction accounts

**Trigger condition**
- Claim instruction detected
- Instruction includes `tokenMint`
- `tokenMint` matches a CA the user is watching

➡️ **Immediate trigger**

**Why this is ideal**
- Fastest possible
- Zero extra lookups
- Minimal logic

---

### Strategy B — Vault/config match (fallback)

Used **only if Strategy A is not possible**.

**Why fallback is needed**
- Some programs do not pass the mint directly
- They pass an internal account (fee vault / config / position)

**What we do**
1) When user adds a CA:
   - Resolve and store:
     ```
     tokenMint → feeShareVault / config account
     ```
   - This is a one-time setup per CA
2) On claim tx:
   - Decode instruction
   - Extract vault/config account
   - Check if it matches any stored mapping

**Trigger condition**
- Claim instruction detected
- Vault/config account maps to a watched CA

➡️ **Trigger buy**

**Cost**
- Slightly more code
- Still real-time
- Still no HTTP polling

---

## What exactly we subscribe to (Yellowstone)

### Programs to watch
- **Bags Fee Share V2**
- (Optionally) Bags Fee Share V1 for older tokens

### Subscription type
- Transaction / instruction stream
- Filter:
  - `program_id == Bags Fee Share program`
- Decode instructions via IDL
- Ignore everything except `claim` instructions

---

## Buy execution

### Requirements
- Execute **immediately after detection**
- Adjustable:
  - buy size (SOL or %)
  - slippage
  - priority fee / CU price
- Retry on:
  - blockhash expiry
  - transient RPC failure

### Execution engine
- **Rust executor on VPS** (preferred for speed)
- Node executor acceptable for MVP

---

## UI pages (unchanged, lean)

### Wallet
- Address
- Balance
- Create wallet
- Export private key (with warnings)

### Settings
- Buy size
- Max SOL cap
- Slippage
- Priority fee
- Trigger mode:
  - first claim
  - every claim
- Telegram notifications

### Sniper
- Paste one or many CAs
- Start / stop
- Status per CA:
  - watching
  - claim detected
  - tx sent
  - confirmed / failed

### Logs
- Claim tx signature
- Buy tx signature
- Errors / retries

---

## Bags API usage (optional, non-critical)

We **do not depend** on Bags API for speed.

Allowed uses:
- UI enrichment (show claim history)
- Verification / analytics
- Debugging
- Manual refresh buttons

Polling cadence:
- Slow and safe (e.g. every 30–60s or on-demand)

If Bags API is down:
- **Sniper still works**

---

## Why we don’t need proxies

- Detection is **on-chain**, not HTTP-based
- Solana WebSocket / gRPC has no per-hour rate limit like Bags API
- Faster than any proxy-based polling
- Lower complexity
- Lower risk

---

## Hosting expectations

- Frontend: Vercel
- Backend API: VPS or Railway
- **Yellowstone gRPC + executor: low-latency VPS**
- Premium Solana RPC for tx sending

---

## Final summary (one paragraph)

This app is a **real-time Bags claim sniper** that listens directly to Solana via Yellowstone gRPC, detects claim instructions instantly, and fires a buy transaction without relying on Bags HTTP APIs. We use a **direct mint match strategy first**, with a **vault/config fallback** when needed. No proxies, no rate-limit issues, no polling bottlenecks — just on-chain signals and fast execution.
