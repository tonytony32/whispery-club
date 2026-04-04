# OpenClaw Observer — Multi-Agent Session Monitor

OpenClaw Observer is a real-time visualiser for multi-agent Whispery sessions. It shows how AI agents communicate inside an encrypted group channel, how their context windows evolve, and how a human operator can inject directives or intercept messages mid-stream.

---

## What it is

A split-layout tab (60 % thread / 40 % sidebar) that renders the live activity of a multi-agent session on `beachclaw.whispery.eth`. In the demo, two AI agents — Betty and Caroline — collaborate on a task assigned by Alice (the human operator). The session uses the same cryptographic primitives as the human messenger: each agent has an NFT, an ENS name, and a Waku keypair.

The tab auto-starts a 90-second scripted demo 2 seconds after load when `VITE_OPENCLAW_DEMO=true`.

---

## ENS identity — one name per agent

Every participant in the session, human or AI, is identified by a `*.whispery.eth` ENS name. This is not cosmetic. The ENS name resolves to an Ethereum address, and that address must hold a WhisperyNFT token to be a channel member.

| Agent    | ENS name                  | Wallet                                       | tokenId |
|----------|---------------------------|----------------------------------------------|---------|
| Alice    | `alice.whispery.eth`      | `0x50b86669634641D9D9ecB2aaEdC18f5d2644f65c` | 1       |
| Betty    | `betty.whispery.eth`      | `0xBF0c2136430053e6839113Abac2E55DBeB0E80a7` | 2       |
| Caroline | `caroline.whispery.eth`   | `0x055476B69029367CF0E26eC784FB456Ed8ebcA00` | 3       |

In the Observer, ENS names are resolved live via `resolveDisplayName()` from `src/omnibar/ensDisplay.ts` and displayed in the **Agents Online** sidebar panel and on every message bubble.

---

## NFT per agent — protocol-level membership

Each agent holds a WhisperyNFT tokenId minted on Sepolia. This is the same contract — `0x51a5a1c73280b7a15dFbD3b173cD178C8a824C16` — used for human membership. There is no special agent contract or separate access tier.

**What the NFT provides:**

1. **Channel access** — `WhisperyBackpack.setChannel` checks `nft.isMember(msg.sender)` on every write. Revoking an agent's token immediately removes its ability to publish EEE updates.
2. **Identity anchor** — `channelId = sha256("whispery/nft/" + tokenId)` is derived from the tokenId. The same deterministic derivation applies whether the holder is human or an AI process.
3. **ACT membership** — the admin includes the agent's X25519 public key in the Access Control Table. The agent derives its `content_key` from its keypair and the EEE — the same `accessGroupChannel` call used by human clients.

Removing an agent from the group is identical to removing a human: burn the token, rotate the epoch, rebuild the EEE without the agent's public key. The agent retains access to past messages (forward secrecy within epochs) but cannot decrypt anything from the new epoch.

---

## Context window as control interface

The context window is how the human operator shapes what agents do and say. OpenClaw exposes three mechanisms:

### 1. Memory Snapshot

The **Memory Snapshot** panel in the sidebar shows key-value variables that are injected into every agent's context:

```
channel       beachclaw.whispery.eth
nft_contract  0x51a5a1c7…C16
epoch         0
current_task  analyse whispery codebase
last_error    null
project_path  /src
```

These variables are updated in real time as the session progresses (e.g. `current_task` changes to `"summary delivered"` once Betty finishes). Every value visible here is part of what the agents "know" at any given moment — changing a value changes the framing of subsequent responses.

### 2. Inject Directive

The **⚡ INJECT** button lets Alice insert a `directive` message into the thread at any point. Directives appear as a highlighted banner (amber) and are attributed to `alice.whispery.eth`. Agents are expected to treat them as high-priority instructions that override or augment the current task.

A directive updates Alice's agent status to `active` and is visible to all session participants in the thread view.

```
Example directive:
  "Add to the summary: the Omnibar supports ENS group names like
   beachclaw.whispery.eth — it is the main entry point for new members."
```

### 3. Intercept Pending Message

When the session is **paused** and there is a pending message in the queue, the **✋ INTERCEPT** button becomes available. Alice can edit the message content before it is committed to the thread — effectively replacing what an agent was about to say.

The intercepted message is attributed to Alice (`alice.whispery.eth`, rose colour) and the original agent message is discarded.

```
Flow:
  PAUSE → next ScriptEntry staged as pendingMessage
    → INTERCEPT opens edit textarea (pre-filled with original content)
    → Alice edits → SEND AS ALICE → message added as alice directive
    → demo resumes
```

---

## Thread view — tree-structured messages

Messages are rendered as a tree using `parentId` references. Replies are indented 24 px per level. The tree structure shows the actual conversation graph — who replied to whom — rather than a flat chronological list.

```
betty-msg-1                         ← root
  └── caroline-msg-1                ← parentId: betty-msg-1
        └── betty-msg-2             ← parentId: caroline-msg-1
betty-action-search                 ← root (parallel work)
caroline-action-readdir             ← root (parallel work)
```

Nodes deeper than level 4 collapse to `[view subtree — N messages]` to prevent the view from becoming unreadable in long sessions.

### Message kinds

| Kind        | Rendered as                              | Who produces it         |
|-------------|------------------------------------------|-------------------------|
| `message`   | Coloured bubble with ENS header          | Any agent               |
| `thought`   | Collapsible italic block (💭)            | AI agents only          |
| `action`    | Tool pill (🛠️) with collapsible I/O    | AI agents only          |
| `directive` | Amber banner (⚡ DIRECTIVE)              | Alice / human operator  |

Thoughts are streamed character-by-character in the **ThoughtStream** drawer at the bottom of the thread panel while an agent is "thinking". When the thought is committed, the drawer collapses and the thought appears in the thread as a collapsed collapsible.

---

## Sidebar — four panels

### Agents Online

Shows each participant with a status dot:

| Colour  | Status     |
|---------|------------|
| Green   | `active`   |
| Amber   | `thinking` |
| Slate   | `idle`     |

Human agents are flagged with a `HUMAN` badge. ENS names are truncated to fit.

### Context Window Usage

A progress bar per AI agent showing `tokenCount / maxTokens`. Colour codes:

- Green — below 60 %
- Amber — 60–85 %
- Red — above 85 %

Token counts are driven by `tokenUpdate` entries in the demo script and would be supplied by the LLM API in a live integration.

### Memory Snapshot

Live key-value view of `MemoryVars` from the Zustand store. Values update as the demo script fires `memoryUpdate` patches.

### ENS Identities

Resolved ENS names, wallet addresses, tokenIds, and an `ADMIN` badge for Alice. Names are fetched live from mainnet ENS via `resolveDisplayName()`.

---

## HumanControls toolbar

Located top-right of the thread panel.

| Button      | Available when           | Effect                                      |
|-------------|--------------------------|---------------------------------------------|
| ⏸ PAUSE     | Always                   | Freezes the demo timer at the current entry |
| ▶ RESUME    | When paused              | Resumes from where it was paused            |
| ⚡ INJECT    | Always                   | Opens directive textarea                    |
| ✋ INTERCEPT | Paused + pendingMessage  | Opens intercept editor with pending content |

---

## Demo script engine

`src/openclaw/demo/DemoMessenger.ts` is a timer-based script engine that replays `DEMO_SCRIPT` from `src/openclaw/demo/script.ts`.

Each `ScriptEntry` carries:

```typescript
delayMs:       number               // ms to wait after the previous entry
streamText?:   boolean              // if true, thought content streams char-by-char
memoryUpdate?: Partial<MemoryVars>  // patches applied to the memory snapshot
tokenUpdate?:  { agentId, count }   // updates the context window bar
```

The engine fires entries sequentially using a `setTimeout` chain. Thoughts are streamed at ~40 characters/second via `setInterval`. When the session is paused, the pending entry is staged in `pendingMessage` and the timer is suspended.

The singleton `demoMessenger` is exported and called by `OpenClawObserver` with a 2-second startup delay.

---

## File structure

```
src/openclaw/
  index.tsx              re-export of OpenClawObserver
  OpenClawObserver.tsx   root layout: header + 60/40 grid
  ThreadPanel.tsx        tree renderer + HumanControls + ThoughtStream drawer
  AgentBubble.tsx        renders message / thought / action / directive
  ThoughtStream.tsx      live streaming drawer at the bottom of the thread
  HumanControls.tsx      PAUSE / INJECT / INTERCEPT toolbar
  Sidebar.tsx            4-panel sidebar: agents, tokens, memory, ENS
  ENSIdentityPanel.tsx   live ENS resolution for each agent wallet
  store.ts               Zustand store — messages, agents, memory, playback
  types.ts               AgentMessage, AgentInfo, MemoryVars, AGENT_COLORS, AGENT_IDENTITIES
  demo/
    script.ts            DEMO_SCRIPT: 17 entries, ~90 s, 4 acts
    DemoMessenger.ts     timer engine: start / pause / resume / stop
```

---

## Environment variables

| Variable                | Description                                      |
|-------------------------|--------------------------------------------------|
| `VITE_OPENCLAW_DEMO`    | Set to `true` to auto-start the 90-second demo   |
