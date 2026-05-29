# MeshTalk

MeshTalk is a local-first, peer-to-peer desktop messaging app for teams on the same network. It provides chat, file sharing, notes, and real-time meetings/screen sharing without a centralized server. Everything is stored locally, and peer connections are established directly between devices.

**Highlights**
- LAN peer discovery with zero central infrastructure
- WebRTC data channels for real-time chat and file transfer
- End-to-end encryption (X25519 + AES-256-GCM)
- Local SQLite storage (offline-first)
- Desktop packaging via Tauri (small footprint, native feel)

**Repo Layout**
- `meshtalk/` main app (React + Tauri)
- `meshtalk/src/` frontend UI and WebRTC client logic
- `meshtalk/src-tauri/` Rust backend (discovery, signaling, crypto, DB, file transfer)

---

**Features**
- 1:1 chat with delivery acknowledgements
- Peer discovery on LAN
- Secure end-to-end encryption for messages
- File transfers with resumable chunking and checksums
- Screen sharing and meetings via WebRTC
- Notes and lightweight group chats
- Local-only persistence using SQLite

---

**Architecture Overview**
- **Discovery**: UDP broadcast announces peers on the LAN.  
  Code: `meshtalk/src-tauri/src/discovery.rs`
- **Signaling**: UDP signaling bridge exchanges WebRTC SDP/ICE messages.  
  Code: `meshtalk/src-tauri/src/signaling.rs`
- **Transport**: WebRTC data channels and media streams connect peers directly.  
  Code: `meshtalk/src/lib/webrtc.js`
- **Encryption**: X25519 ECDH for session keys, AES-256-GCM for messages.  
  Code: `meshtalk/src-tauri/src/crypto.rs`
- **Storage**: Local SQLite database for users, messages, notes, and groups.  
  Code: `meshtalk/src-tauri/src/db.rs`
- **File Transfer**: Chunked transfers with checksums and resume support.  
  Code: `meshtalk/src-tauri/src/file_transfer.rs`
- **File Serving**: Tiny HTTP server for shared files and avatars.  
  Code: `meshtalk/src-tauri/src/file_server.rs`


**License**
TBD
