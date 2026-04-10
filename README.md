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

---

**Prerequisites**
MeshTalk is a Tauri v2 app, so you need system dependencies, Rust, and Node.js.

**1. System Dependencies (Tauri)**
Follow the official Tauri prerequisites for your OS. These are required even if you already have Rust and Node installed.  
Docs: `https://v2.tauri.app/start/prerequisites/`

**Linux (Debian/Ubuntu)**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Linux (Arch)**
```bash
sudo pacman -Syu
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool
```

**Linux (Fedora)**
```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel
sudo dnf group install "c-development"
```

If you are on another distro (Gentoo, openSUSE, Alpine, NixOS, etc.), follow the Tauri prerequisites page for exact packages.

**macOS**
- Install Xcode from the App Store, or
- Install command line tools only:
```bash
xcode-select --install
```

**Windows**
- Install Microsoft C++ Build Tools and select **Desktop development with C++**
- Ensure Microsoft Edge WebView2 Runtime is installed  
Docs: `https://v2.tauri.app/start/prerequisites/`

**2. Install Rust (rustup)**
Official docs: `https://www.rust-lang.org/tools/install`

**macOS / Linux**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Windows**
- Download and run `rustup-init.exe` from the Rust website.
- During install, keep the default MSVC toolchain.

Verify:
```bash
rustc --version
cargo --version
```

**3. Install Node.js (LTS)**
Download and install the latest LTS from:
`https://nodejs.org/en/download`

Verify:
```bash
node -v
npm -v
```

**4. Enable pnpm via Corepack**
This repo pins pnpm in `package.json` (see `packageManager`).
```bash
corepack enable
```

---

**Setup**
From the repo root:
```bash
cd meshtalk
pnpm install
```

---

**Run (Development)**
**Web UI only**
```bash
pnpm dev
```

**Full desktop app (Tauri)**
```bash
pnpm tauri dev
```

---

**Build**
**Web bundle**
```bash
pnpm build
```

**Desktop bundle**
```bash
pnpm tauri build
```

On Windows, MSI builds require the optional VBSCRIPT feature to be enabled (see Tauri prerequisites).

---

**Configuration**
**Multi-instance (optional)**  
You can run multiple isolated app instances by setting:
- `MESHTALK_INSTANCE`
- `PINGO_INSTANCE` (legacy fallback)

These change the local data directory and downloads folder names.

---

**Ports Used**
- UDP discovery: `15353`
- UDP signaling: default `45678`
- HTTP file server: dynamic port (assigned at runtime)

---

**Data Locations (Typical)**
MeshTalk uses OS default data directories.
- Windows: `%LOCALAPPDATA%/MeshTalk`
- macOS: `~/Library/Application Support/MeshTalk`
- Linux: `~/.local/share/MeshTalk`

The SQLite DB is stored as `meshtalk.db` in that folder.

---

**Troubleshooting**
- If `tauri dev` fails with build errors on Windows, verify C++ build tools and WebView2 are installed.
- If Linux builds fail, confirm all WebKit2GTK and appindicator packages are installed.
- If Rust commands fail, restart your terminal to refresh `PATH`.

---

**License**
TBD
