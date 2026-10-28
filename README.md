# 💬 ChatRoom — Free no-login chat rooms on Netlify

A full-stack real-time chat app that deploys **directly to Netlify's free plan**. **No login, no signup, no card.** Pick a nickname, create a room, share the ID with friends, and chat with funny animated emojis — on desktop or mobile.

Built as a **static frontend + Netlify Functions (serverless backend) + Netlify Blobs (free persistent storage)** — one `git push` deploys everything.

---

## ✨ Features

- 🚫 **No auth** — just pick a nickname (saved in localStorage, auto-filled next time)
- 🏠 **Create rooms** with an optional password (hashed with bcrypt — never stored in plain text)
- 🔑 **Join by room ID** — friends join from the live-rooms list or by typing the ID
- 📨 **Invite by username** — invites land in the invitee's inbox and pop up live (accept/decline)
- 😄 **Animated emoji picker** — 6 categories, emojis pop, spin & bounce as big sticker messages
- ⌨️ **Live typing indicator**, 👥 **live member & online-user lists**, join/leave system messages
- 📜 **Persistent chat history** (last 200 messages per room) — stored in Netlify Blobs, survives redeploys and cold starts
- 📱 **Mobile-first animated UI** — works great in any phone browser

## 🏗️ How it works on Netlify

Netlify serverless functions can't host a long-lived WebSocket server or a SQLite file, so this build uses the platform's own primitives:

| Piece | Implementation |
|---|---|
| Frontend | Static site in `public/` (same UI as before) |
| Backend | One serverless function: `netlify/functions/api.mjs` at `/api` — action-based routing (`create-room`, `join-room`, `send-message`, `state`, `presence`, `typing`, `invite`, `inbox`, `rooms`) |
| Storage | **Netlify Blobs** (`chatroom-data` store) — persistent across deploys, included free |
| Realtime | Short-interval polling (~1.3s for messages, ~2.5s presence, ~3.5s invites) instead of WebSockets |
| Passwords | bcrypt-hashed, verified server-side on join |

> 💾 **Data model in Blobs:** `room:<id>` (room record) · `pw:<id>` (bcrypt hash) · `m:<roomId>:<ts>:<rand>` (messages, auto-capped at 200/room) · `member:<roomId>:<nick>` (room membership) · `presence:<nick>` (online users, 60s TTL) · `typing:<roomId>:<nick>` (4s TTL) · `invite:<id>` (90s TTL)

## 🚀 Deploy to Netlify (free, ~5 minutes)

### Option A — Git (recommended)

1. Push this folder to a GitHub repo:
   ```bash
   unzip chatapp-netlify.zip && cd chatapp
   git init -b main
   git add . && git commit -m "ChatRoom on Netlify"
   # create an empty repo on github.com first, then:
   git remote add origin https://github.com/YOUR_USERNAME/chatroom.git
   git push -u origin main
   ```
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → connect GitHub and pick your repo
3. Netlify auto-reads `netlify.toml`: build command none needed, publish dir `public`, functions dir `netlify/functions`
4. **Deploy** — you get a live URL like `https://your-site.netlify.app` 🎉

No environment variables needed — Netlify Blobs is zero-config inside your own site.

### Option B — Netlify CLI

```bash
npm install
npx netlify-cli deploy --prod          # follow the login prompts
```

### Local development

```bash
npm install
npx netlify-cli dev     # serves the site + functions + a sandboxed Blobs store at localhost:8888
npm run test:api        # 15 automated checks incl. persistence across cold starts
```

## ⚠️ Tradeoffs vs the WebSocket build

- **Latency:** new messages appear within ~1–2 seconds (polling), not instantly. Typing indicators feel slightly softer for the same reason.
- **Cost shape:** every poll is a function invocation. Netlify's free plan is credit-based (300 credits/month, functions metered at 10 credits per GB-hour — see [Netlify pricing](https://www.netlify.com/pricing/)). A handful of friends chatting casually sits comfortably in the free tier; a busy public room could burn through credits. If that happens, lengthen the poll intervals in `public/client.js` (`startPolling()`), or move to Render/Koyeb with the WebSocket build.
- **No push to specific sockets:** "online" is a 60-second presence window, so someone who closes their tab shows offline within a minute.

## 📁 Project structure

```
chatapp/
├── netlify.toml                  # publish dir, functions dir, redirects
├── netlify/functions/
│   ├── api.mjs                   # all backend logic (action-based router)
│   └── store.mjs                 # Netlify Blobs wrapper (JSON-file fallback for local tests)
├── public/
│   ├── index.html                # Entry screen, chat screen, modals
│   ├── style.css                 # Mobile-first animated UI
│   └── client.js                 # API client + polling + emoji picker
├── test-api.mjs                  # 15 automated checks incl. persistence across cold starts
└── package.json
```

## 🔌 API reference (for extending)

`POST /api?action=<action>` with a JSON body (all return `{ok, ...}`):

| Action | Body | Returns |
|---|---|---|
| `create-room` | `{name, password?, nickname?}` | `{room}` |
| `join-room` | `{roomId, password?, nickname}` | `{room, history}` |
| `send-message` | `{roomId, nickname, text, type}` | `{msg}` — requires prior join |
| `state` | `{roomId, nickname?, since}` | `{messages, typers, members, hasPassword}` |
| `presence` | `{nickname?, roomId?}` | `{online[]}` |
| `typing` | `{roomId, nickname, on}` | `{ok}` |
| `invite` | `{roomId, from, to, password?}` | `{ok}` — invitee must be online |
| `inbox` | `{nickname}` | `{invites[]}` |
| `invite-close` | `{id}` | `{ok}` |
| `rooms` | — | `{rooms[]}` |
