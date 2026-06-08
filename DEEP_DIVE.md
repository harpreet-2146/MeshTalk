# MeshTalk — System Internals

> A technical deep-dive into how MeshTalk discovers peers, encrypts messages, routes data across a local mesh, and why every technology choice was made the way it was.

---

## Table of Contents

1. [Why Rust?](#1-why-rust)
2. [Why Tauri?](#2-why-tauri)
3. [Application Architecture Overview](#3-application-architecture-overview)
4. [UDP Peer Discovery](#4-udp-peer-discovery)
5. [TCP Signaling Server](#5-tcp-signaling-server)
6. [End-to-End Encryption](#6-end-to-end-encryption)
7. [WebRTC for Meetings](#7-webrtc-for-meetings)
8. [SQLite — Local-First Storage](#8-sqlite--local-first-storage)
9. [File Transfer System](#9-file-transfer-system)
10. [Screen Capture](#10-screen-capture)
11. [IPC Bridge — Frontend ↔ Backend](#11-ipc-bridge--frontend--backend)
12. [System Tray & Lifecycle](#12-system-tray--lifecycle)
13. [Data Flow: Sending a Message End-to-End](#13-data-flow-sending-a-message-end-to-end)

---

## 1. Why Rust?

MeshTalk's backend is written entirely in Rust. This was not an arbitrary choice.

**Memory safety without a garbage collector.** Every other systems language (C, C++) requires manual memory management and is prone to use-after-free, buffer overflows, and data races. Rust eliminates all of these at compile time through its ownership model — no garbage collector pauses, no runtime overhead, no class of vulnerabilities.

**Fearless concurrency.** MeshTalk runs several concurrent tasks: a UDP listener thread, a UDP announcer thread, a TCP signaling listener, a file server, and the Tauri event loop — all at once. Rust's borrow checker guarantees at compile time that no two threads can mutably access the same data simultaneously without explicit synchronization (`Arc<RwLock<T>>`), making race conditions a compile error rather than a runtime surprise.

**Actual performance on the network hot path.** UDP packets arrive at ~500ms poll intervals. Rust processes them in microseconds with zero allocations on the hot path. The same code compiled with `opt-level = "z"` and `lto = true` produces a binary smaller than most Electron splash screens.

**The crate ecosystem.** `tokio` for async, `rusqlite` for SQLite, `aes-gcm` / `x25519-dalek` for cryptography, `socket2` for fine-grained socket control, `scrap` for screen capture — these are production-grade crates, not toy wrappers. The alternatives in Node.js or Python require pulling in C extensions or network calls to do the same thing.

---

## 2. Why Tauri?

The dominant alternative for cross-platform desktop apps with a web UI is Electron. Electron ships a full copy of Chromium and a full Node.js runtime — typically 150–300 MB of overhead before your app starts. MeshTalk's Tauri build is **under 15 MB**.

| | Tauri | Electron |
|---|---|---|
| Bundle size | ~8–15 MB | ~150–300 MB |
| RAM baseline | ~30–60 MB | ~150–300 MB |
| Backend language | Rust | Node.js (JS) |
| WebView | OS native (WebView2/WKWebView) | Bundled Chromium |
| IPC | `invoke()` → Rust commands | `ipcMain` / `ipcRenderer` |
| Memory safety | Compile-time | None |

Tauri uses the operating system's native WebView (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux) to render the React frontend. Communication between the frontend and the Rust backend happens through a typed IPC bridge — `invoke('command_name', args)` on the JS side maps directly to a `#[tauri::command]` fn in Rust, with automatic JSON serialization of inputs and outputs via `serde`.

This architecture gives MeshTalk a native app feel (minimize to tray, system notifications, file system access) without the overhead and security surface of Electron.

---

## 3. Application Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  Chat · Meetings · Notes · Settings · Network (How It Works)    │
│                                                                 │
│              invoke("command", args) ──► IPC Bridge             │
└─────────────────────────────────┬───────────────────────────────┘
                                  │  Tauri WebView
┌─────────────────────────────────▼───────────────────────────────┐
│                        Rust Backend                             │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ DiscoveryMgr │  │ SignalingServer│  │   CryptoManager      │  │
│  │  (UDP :15353)│  │  (UDP loopbk) │  │  X25519 + AES-GCM    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                 │                                     │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────────────────────┐  │
│  │   Database   │  │ FileTransfer │  │    FileServer         │  │
│  │  (SQLite/WAL)│  │   Manager    │  │  (tiny_http server)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AppState (Arc-shared across all handlers)   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                        │                │
               ┌────────▼────┐    ┌──────▼──────┐
               │  LAN / Wi-Fi│    │  Filesystem  │
               └─────────────┘    └─────────────┘
```

All managers are wrapped in `Arc<T>` (atomic reference counting) so they can be safely shared across Tauri's async command handlers and background threads simultaneously.

---

## 4. UDP Peer Discovery

**File:** `src-tauri/src/discovery.rs`

This is the heartbeat of MeshTalk. Every device on the local network needs to find every other device without a central server to coordinate them. The answer is UDP broadcast.

### How it works

On startup, `DiscoveryManager::start()` does three things:

**1. Creates a broadcast-capable UDP socket using `socket2`**

```rust
let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
socket.set_reuse_address(true)?;
socket.set_broadcast(true)?;
socket.bind(&SocketAddr::new(Ipv4Addr::UNSPECIFIED, DISCOVERY_PORT).into())?;
```

Port `15353` is used (chosen to avoid conflicts with mDNS on 5353). `set_broadcast(true)` is required by the OS to allow sending to `255.255.255.255`. `set_reuse_address(true)` allows multiple MeshTalk instances on the same machine to bind the same port simultaneously.

The `socket2` crate is used instead of `std::net::UdpSocket` because the standard library doesn't expose `SO_REUSEADDR` and `SO_BROADCAST` with the granularity needed for cross-platform correct behavior.

**2. Spawns a listener thread**

```rust
thread::spawn(move || {
    while *running.lock().unwrap() {
        match socket.recv_from(&mut buf) {
            Ok((amt, src_addr)) => {
                let packet: DiscoveryPacket = serde_json::from_slice(&buf[..amt])?;
                if packet.peer.device_id == local_device_id { continue; } // ignore self
                // update peer map, emit PeerDiscovered / PeerUpdated / PeerLost
            }
        }
    }
});
```

The listener sits in a blocking `recv_from` loop with a 500ms read timeout. Every received packet is deserialized from JSON (`serde_json`) into a `DiscoveryPacket` struct. The source IP is taken from `src_addr` — not from the packet payload — because the sender sets its IP to `0.0.0.0` (it doesn't know its own LAN IP in all cases); the OS fills it in correctly in `src_addr`.

**3. Spawns an announcer thread**

```rust
thread::spawn(move || {
    while *running.lock().unwrap() {
        let packet = DiscoveryPacket { msg_type: Hello, peer: local_info };
        socket.send_to(&serde_json::to_vec(&packet)?, broadcast_addr);
        // also send to each subnet-specific broadcast (e.g. 192.168.1.255)
        thread::sleep(Duration::from_secs(3));
    }
    // on exit: send Bye packet
});
```

Every 3 seconds, the announcer broadcasts a `Hello` packet to `255.255.255.255:15353` **and** to each subnet-specific broadcast address (e.g. `192.168.1.255`). The subnet addresses are computed by calling `network_interface::NetworkInterface::show()` and deriving the broadcast from each NIC's IP + netmask. This dual-broadcast approach handles networks where routers block `255.255.255.255`.

When the app closes, a `Bye` packet is sent immediately so peers don't have to wait for the 15-second timeout to mark the device offline.

**Peer state machine:**

```
[not seen] → Hello received → PeerDiscovered
[online]   → Hello received → PeerUpdated (resets last_seen timer)
[online]   → no Hello for 15s → PeerLost (timeout)
[online]   → Bye received → PeerLost (immediate)
```

The peer map is a `Arc<RwLock<HashMap<String, Peer>>>` — multiple readers (get_peers queries from the frontend) hold shared read locks, while the listener thread holds an exclusive write lock only for the duration of the HashMap mutation.

---

## 5. TCP Signaling Server

**File:** `src-tauri/src/signaling.rs`

UDP discovery tells you a peer exists and what their IP is. To start a WebRTC meeting, you need to exchange SDP offers/answers and ICE candidates — this is the signaling phase. MeshTalk implements this via a loopback UDP channel between the Rust backend and the frontend's WebRTC engine.

The `SignalingServer` maintains a message queue per peer device ID:

```rust
pub struct SignalingServer {
    device_id: String,
    pending_messages: Arc<RwLock<HashMap<String, Vec<SignalingMessage>>>>,
    peer_ports: Arc<RwLock<HashMap<String, u16>>>,
}
```

**Message types handled:**

| Type | Purpose |
|------|---------|
| `Offer` | SDP offer from WebRTC initiator |
| `Answer` | SDP answer from WebRTC responder |
| `IceCandidate` | NAT traversal candidate pair |
| `ConnectionRequest` | Meeting invite sent to peer |
| `ConnectionAccepted` | Peer accepted invite |
| `ConnectionRejected` | Peer declined |
| `ScreenShareInvite` | Screen share request |
| `ScreenShareResponse` | Accepted / declined |
| `FileTransferRequest` | Initiate chunked file transfer |

The frontend calls `send_signaling_message` (Tauri invoke), which serializes the message and sends it to the target peer's IP over UDP. The receiving peer's backend deserializes it and queues it; the frontend polls with `get_pending_messages` to retrieve it and feed it into the WebRTC stack.

This design avoids needing a STUN/TURN server for LAN-only connections — because both peers are on the same subnet, ICE will always resolve to a direct path without NAT traversal.

---

## 6. End-to-End Encryption

**File:** `src-tauri/src/crypto.rs`  
**Crates:** `x25519-dalek`, `aes-gcm`, `sha2`, `rand`

Every message in MeshTalk is encrypted before it leaves the device and decrypted only by the intended recipient. The scheme is:

### Key Exchange: X25519 Elliptic Curve Diffie-Hellman

On first launch, each device generates a permanent X25519 keypair:

```rust
let secret = StaticSecret::random_from_rng(&mut rng);
let public = PublicKey::from(&secret);
```

The public key is broadcast with every UDP discovery packet. When two peers discover each other, they each call `establish_session`:

```rust
pub fn establish_session(&self, peer_id: &str, peer_public_key_b64: &str) -> Result<(), String> {
    let peer_pub_bytes = BASE64.decode(peer_public_key_b64)?;
    let peer_pub = PublicKey::from(<[u8; 32]>::try_from(peer_pub_bytes)?);
    let my_secret = StaticSecret::from(self.device_keypair.read()?.secret_key);
    let shared = my_secret.diffie_hellman(&peer_pub);
    // Hash with SHA-256 to derive the session key
    let key = Sha256::digest(shared.as_bytes());
    self.session_keys.write()?.insert(peer_id, SessionKey { shared_secret: key.into(), ... });
}
```

X25519 ECDH means both sides independently compute the same 256-bit shared secret using only public information exchanged over the discovery broadcast. Nobody observing the network can derive this secret without solving the Elliptic Curve Discrete Logarithm Problem.

### Encryption: AES-256-GCM

Each message is encrypted with the session key using AES-256-GCM (Galois/Counter Mode):

```rust
pub fn encrypt_message(&self, peer_id: &str, plaintext: &str) -> Result<EncryptedEnvelope, String> {
    let key = self.session_keys.read()?.get(peer_id).shared_secret;
    let cipher = Aes256Gcm::new_from_slice(&key)?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes); // fresh random nonce each message
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())?;
    Ok(EncryptedEnvelope {
        nonce: BASE64.encode(nonce_bytes),
        ciphertext: BASE64.encode(ciphertext),
        sender_public_key: BASE64.encode(my_public_key),
    })
}
```

GCM mode provides both **confidentiality** (nobody reads the content) and **authentication** (any bit-flip in transit causes decryption to fail). A fresh 12-byte random nonce is generated for every single message, preventing nonce reuse attacks.

The encrypted envelope is what travels over the network — the plaintext never leaves the originating device unencrypted.

---

## 7. WebRTC for Meetings

**Files:** `src/pages/meetings.jsx`, `src/lib/MeetingRTCManager.js`, `src-tauri/src/signaling.rs`

Voice/video meetings use the browser's native WebRTC engine (`RTCPeerConnection`) running inside Tauri's WebView. The Rust backend handles the signaling plane; WebRTC handles the media plane.

### Signaling flow (Offer/Answer)

```
Device A (initiator)                    Device B (responder)
─────────────────                       ─────────────────────
createOffer()
  └─► SDP Offer ──► invoke(send_signaling_message) ──► UDP ──►
                                           receive Offer
                                           createAnswer()
                                             └─► SDP Answer ──► UDP ──►
receive Answer
setRemoteDescription()
                                           setRemoteDescription()

Both sides:
  onicecandidate ──► UDP ──► addIceCandidate()   (repeated for each candidate)

RTCPeerConnection ESTABLISHED — direct UDP media stream
```

### Why UDP for media

Audio and video use `RTCPeerConnection` data channels and media tracks, which WebRTC sends over DTLS-SRTP (encrypted UDP). This is intentional: UDP has no retransmission or ordering overhead. If a voice packet arrives 50ms late, it's useless — you drop it and move on. Buffering late audio causes the "robot voice" effect. UDP's fire-and-forget model matches the real-time nature of voice.

Text chat within meetings (the side panel) uses the same signaling channel over TCP-like reliability for guaranteed delivery.

### Screen sharing

`src-tauri/src/screen_capture.rs` uses the `scrap` crate to capture the primary display frame buffer directly in Rust. Frames are BGRA-encoded, converted to PNG via the `image` crate, base64-encoded, and sent to the frontend as data URLs for display. The capture loop runs at configurable FPS.

---

## 8. SQLite — Local-First Storage

**File:** `src-tauri/src/db.rs`  
**Crate:** `rusqlite` (bundled, so no external libsqlite3 dependency)

All persistent data lives in a single SQLite file at:
- Windows: `C:\Users\<name>\AppData\Local\MeshTalk\meshtalk.db`
- macOS: `~/Library/Application Support/MeshTalk/meshtalk.db`
- Linux: `~/.local/share/MeshTalk/meshtalk.db`

The database connection is wrapped in `Mutex<Connection>` — SQLite in WAL (Write-Ahead Logging) mode allows concurrent reads, but `rusqlite`'s connection is not `Send`, so a single mutex-guarded connection is the correct pattern here.

**Tables:**

| Table | Purpose |
|-------|---------|
| `users` | All known peers: device_id, username, public_key, avatar_path |
| `messages` | Chat history: sender, receiver, content, type, is_read, is_delivered |
| `files` | File transfer records with checksum and completion status |
| `settings` | Key-value store for app config (device_id, username, theme, etc.) |
| `notes` | User notepad entries with title, content, color, pinned state |
| `groups` | Group chat rooms |
| `group_members` | Group membership with role (admin/member) |
| `group_messages` | Group chat history |

**WAL mode** is enabled on DB open. WAL separates readers from writers — a writer appends to a write-ahead log file while readers continue reading the main DB file, then the WAL is checkpointed periodically. This eliminates reader/writer blocking and is critical for responsiveness when the frontend is reading message history while a background thread is writing incoming messages.

Indexes on `(sender_id, receiver_id, created_at)` make paginated message queries fast even with tens of thousands of stored messages.

---

## 9. File Transfer System

**File:** `src-tauri/src/file_transfer.rs` + `src/lib/FileTransferManager.js`

Files are sent in 64 KB chunks. This allows:
- Resumable transfers (track which chunks arrived)
- Progress reporting at fine granularity
- Parallel chunk delivery (future optimization)

The sender calls `prepare_file_send` which:
1. Reads the file from disk
2. Splits it into chunks of 65,536 bytes each
3. Computes a SHA-256 checksum per chunk
4. Returns the file metadata (name, size, total chunks, mime type)

The receiver calls `prepare_file_receive` to register the incoming transfer, then repeatedly calls `receive_file_chunk`. The `FileTransferManager` tracks which chunks have arrived; `get_missing_chunks` returns the list of unacknowledged chunk indices so the sender can retransmit on packet loss.

Once all chunks arrive, `complete_transfer` reassembles the file from chunks and writes it to the user's MeshTalk downloads folder (`Documents/MeshTalk/<sender_name>/`).

**File server** (`src-tauri/src/file_server.rs`): A `tiny_http` HTTP server runs in the background. Avatars and shared media are registered with the file server and served over `http://127.0.0.1:<port>/`. This lets the React frontend load images via `<img src="http://...">` without needing base64 inlining.

---

## 10. Screen Capture

**File:** `src-tauri/src/screen_capture.rs`  
**Crate:** `scrap`, `image`

`scrap` captures the GPU framebuffer directly without going through the OS screenshot API. It locks the display frame for the duration of the read — typically microseconds. The raw BGRA pixel data is:

1. Converted from BGRA to RGBA (scrap uses BGRA on Windows)
2. Encoded as PNG using the `image` crate
3. Base64-encoded and returned to the frontend as a data URL

Commands exposed:
- `list_displays` — returns all connected monitors with dimensions
- `capture_screen` — captures a specific display by index
- `capture_screen_primary` — captures display 0

In meeting screen-share mode, the frontend polls this command at regular intervals and sends frames through the WebRTC data channel.

---

## 11. IPC Bridge — Frontend ↔ Backend

**File:** `src-tauri/src/commands.rs` + `src-tauri/src/lib.rs`

Tauri's IPC model: the frontend calls `invoke('command_name', { arg1, arg2 })`. Tauri routes this to a Rust function tagged `#[tauri::command]`, deserializes the JSON arguments, runs the function, serializes the return value back to JSON, and resolves the `Promise` on the JS side.

MeshTalk exposes **60+ commands** across categories:

```
Initialization:     init_app
Identity:           create_user, get_local_user, get_all_users, upsert_peer_user
Messaging:          send_message, get_messages, mark_message_read, get_unread_count
                    get_messages_paginated, get_new_messages_since, delete_message
Discovery:          start_discovery, stop_discovery, get_peers, get_online_peers
                    restart_discovery, relay_chat_message
Signaling:          start_signaling, register_peer, send_signaling_message
Encryption:         establish_session, encrypt_message, decrypt_message, get_public_key
File Transfer:      prepare_file_send, prepare_file_receive, get_file_chunk
                    receive_file_chunk, get_transfer_progress, complete_transfer
Files:              auto_download_file, open_file_location, save_file_with_dialog
                    get_shared_media, store_shared_file, get_file_server_port
Notes:              save_note, get_all_notes, delete_note, toggle_note_pin
Groups:             create_group, get_groups, send_group_message, get_group_messages
                    add_group_member, remove_group_member, leave_group
Settings:           set_setting, get_setting, get_all_settings
Window:             minimize_to_tray, show_window, is_window_visible
Screen:             capture_screen_primary, capture_screen, list_displays
Utility:            get_device_id, generate_uuid, get_timestamp, get_storage_stats
```

All of AppState's components — `Database`, `DiscoveryManager`, `CryptoManager`, `SignalingServer`, `FileTransferManager`, `FileServer` — are held in `Arc<T>` so they can be shared across concurrent command invocations without copying.

---

## 12. System Tray & Lifecycle

**File:** `src-tauri/src/tray.rs` + `src-tauri/src/lib.rs`

When the user closes the window, MeshTalk intercepts the `CloseRequested` event and hides the window instead of terminating:

```rust
window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window_clone.hide();
    }
});
```

This keeps the UDP listener and announcer threads running in the background. Peers on the network continue to see the device as online. The system tray icon remains visible; clicking it calls `show_window` to restore the app.

The `tauri-plugin-autostart` plugin registers MeshTalk as a login item (Launch Agent on macOS, registry run key on Windows) so it starts with `--minimized` on boot, ensuring you're always discoverable without having to manually open the app.

---

## 13. Data Flow: Sending a Message End-to-End

This traces exactly what happens when you type a message and press Enter:

```
1. User presses Enter in ChatPage (React)
   └─► sendMessage(peerId, text) called

2. Frontend calls invoke('establish_session', { peer_id, peer_public_key })
   └─► CryptoManager::establish_session()
       └─► X25519 ECDH with peer's public key (from discovery broadcast)
       └─► SHA-256 of shared secret → 256-bit AES session key stored in memory

3. Frontend calls invoke('encrypt_message', { peer_id, content })
   └─► CryptoManager::encrypt_message()
       └─► Random 12-byte nonce generated
       └─► AES-256-GCM encrypt(plaintext, session_key, nonce)
       └─► Returns EncryptedEnvelope { nonce, ciphertext, sender_public_key } (all Base64)

4. Frontend calls invoke('send_message', { receiver_id, content: envelope, ... })
   └─► Database::create_message() — stores message locally in SQLite
   └─► Returns message object to frontend

5. Frontend sends envelope over WebSocket/WebRTC data channel to peer's IP:PORT
   (direct TCP socket connection managed by MeetingRTCManager or chat socket in JS)

6. Peer's frontend receives encrypted envelope
   └─► invoke('establish_session', { peer_id: sender_id, peer_public_key })
   └─► invoke('decrypt_message', { peer_id: sender_id, envelope })
       └─► CryptoManager::decrypt_message()
           └─► AES-256-GCM decrypt(ciphertext, session_key, nonce)
           └─► Returns plaintext string

7. Peer stores decrypted message:
   └─► invoke('send_message', { content: plaintext, ... }) — written to their SQLite

8. UI updates via React state — message appears in chat
```

The plaintext content (`step 1`) and the decrypted result (`step 6`) exist only in the JS heap of the originating and receiving devices respectively. The encrypted envelope (`step 5`) is the only thing that crosses the network.

---

## Technology Reference

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | Tauri v2 | Native performance, tiny bundle, OS WebView |
| Backend language | Rust (edition 2021) | Memory safety, fearless concurrency, zero GC |
| Frontend | React + Vite | Fast HMR, component model, wide ecosystem |
| Peer discovery | UDP broadcast (port 15353) | Zero-config, no server, works on all LANs |
| Signaling | UDP (loopback + LAN) | Low latency, stateless, no TCP handshake delay |
| Chat transport | TCP (managed in JS) | Reliable ordered delivery for messages |
| Media transport | WebRTC / DTLS-SRTP / UDP | Real-time, encrypted, browser-native |
| Key exchange | X25519 ECDH (x25519-dalek) | Fast, secure, 256-bit keys |
| Message encryption | AES-256-GCM (aes-gcm) | AEAD: confidentiality + authenticity |
| Storage | SQLite with WAL (rusqlite) | Offline-first, no server, ACID compliant |
| Socket control | socket2 | Fine-grained SO_BROADCAST / SO_REUSEADDR |
| Async runtime | Tokio | Industry-standard Rust async runtime |
| Serialization | serde + serde_json | Zero-cost struct ↔ JSON |
| Screen capture | scrap + image | Direct framebuffer access, no OS API overhead |
| File serving | tiny_http | Embedded HTTP server for local media |
| IPC | Tauri invoke_handler (60+ cmds) | Type-safe JS ↔ Rust bridge |

---

*MeshTalk — built for local networks, built to last.*
