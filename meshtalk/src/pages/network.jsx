import React, { useState } from 'react';

// ─── Static topology data ─────────────────────────────────────────────────────
const NODES = [
    { id: 'a', x: 50,  y: 50,  label: 'You',     sub: 'this device' },
    { id: 'b', x: 78,  y: 28,  label: 'Peer A',  sub: 'laptop' },
    { id: 'c', x: 78,  y: 72,  label: 'Peer B',  sub: 'desktop' },
    { id: 'd', x: 22,  y: 28,  label: 'Peer C',  sub: 'phone' },
    { id: 'e', x: 22,  y: 72,  label: 'Peer D',  sub: 'tablet' },
    { id: 'f', x: 50,  y: 18,  label: 'Peer E',  sub: 'laptop' },
    { id: 'g', x: 50,  y: 82,  label: 'Peer F',  sub: 'desktop' },
];

const EDGES = [
    ['a','b'],['a','c'],['a','d'],['a','e'],
    ['b','f'],['c','g'],['d','f'],['e','g'],
    ['b','c'],['d','e'],['f','g'],
];

const CONCEPTS = [
    {
        tag: 'DISCOVERY',
        title: 'Peer Discovery via UDP Broadcast',
        body: 'On startup, MeshTalk broadcasts a UDP announce packet to 255.255.255.255:PORT. Every device on the same subnet hears it and replies with its identity — username, device ID, and local IP. No server, no DNS, no internet.',
        proto: 'UDP · LAN broadcast · port 56700',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
                <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M17.66 6.34l-1.41 1.41M6.34 17.66l-1.41 1.41"/>
            </svg>
        ),
    },
    {
        tag: 'TRANSPORT',
        title: 'TCP for Reliable Messaging',
        body: 'Once peers are discovered, MeshTalk opens a TCP socket for chat messages, file transfers, and signalling. TCP guarantees delivery and ordering — critical for text that must not drop or arrive scrambled.',
        proto: 'TCP · bidirectional stream · TLS optional',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M22 12H2M22 12l-4-4M22 12l-4 4"/>
                <path d="M2 12l4-4M2 12l4 4"/>
            </svg>
        ),
    },
    {
        tag: 'MEDIA',
        title: 'WebRTC + DTLS-SRTP for Voice & Video',
        body: 'Meetings use WebRTC — the same engine that powers browser video calls. ICE negotiates the best path (LAN direct, or relay via TURN). DTLS-SRTP encrypts the media stream end-to-end. Audio packets ride UDP so late packets are dropped, not queued.',
        proto: 'WebRTC · ICE · DTLS-SRTP · UDP media',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
        ),
    },
    {
        tag: 'MESH ROUTING',
        title: 'Multi-Hop Mesh Forwarding',
        body: "If Peer A can't reach Peer D directly, messages hop through intermediate nodes automatically. Each node maintains a routing table of known peers and their reachability. The path is re-evaluated on every send, so network changes are handled gracefully.",
        proto: 'Application-layer routing · TTL-limited hops',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
        ),
    },
    {
        tag: 'ENCRYPTION',
        title: 'End-to-End Encryption',
        body: "Messages are encrypted with a shared key derived from both peers' identity — never stored on disk in plaintext. Meeting streams are encrypted by DTLS-SRTP at the WebRTC layer. No intermediary (including MeshTalk itself) can read your messages.",
        proto: 'ECDH key exchange · AES-256-GCM · DTLS 1.2',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
        ),
    },
    {
        tag: 'STORAGE',
        title: 'Local-First Data with SQLite',
        body: 'All messages, notes, and contact info live in a local SQLite database managed by the Rust backend (via Tauri). Nothing syncs to a cloud — your history is yours, offline-capable, and survives network outages.',
        proto: 'SQLite · Tauri (Rust) IPC · local filesystem',
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
        ),
    },
];

const STACK = [
    { label: 'MeshTalk UI',       sub: 'React + Tauri webview',        color: '#7d9a72' },
    { label: 'App Protocol',      sub: 'JSON messages · custom framing', color: '#60a5fa' },
    { label: 'WebRTC / Sockets',  sub: 'RTCPeerConnection · TCP stream', color: '#a78bfa' },
    { label: 'ICE / STUN',        sub: 'NAT traversal · candidate pairs', color: '#f59e0b' },
    { label: 'TLS / DTLS-SRTP',   sub: 'Encryption layer',              color: '#f472b6' },
    { label: 'TCP / UDP',         sub: 'Transport layer',               color: '#fb923c' },
    { label: 'IP / LAN',          sub: '192.168.x.x · 10.x.x.x',       color: '#888' },
];

// ─── Topology SVG ─────────────────────────────────────────────────────────────
function TopologyMap() {
    const [active, setActive] = useState(null);

    const W = 560, H = 320;
    const px = (pct) => (pct / 100) * W;
    const py = (pct) => (pct / 100) * H;

    const nodeMap = Object.fromEntries(NODES.map(n => [n.id, n]));

    return (
        <div className="nw-topology-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} className="nw-topology-svg" role="img" aria-label="Mesh network topology">
                <defs>
                    <radialGradient id="ng" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#7d9a72" stopOpacity="0.18"/>
                        <stop offset="100%" stopColor="#7d9a72" stopOpacity="0"/>
                    </radialGradient>
                </defs>

                {/* Edges */}
                {EDGES.map(([aid, bid]) => {
                    const a = nodeMap[aid], b = nodeMap[bid];
                    const isActive = active === aid || active === bid;
                    return (
                        <line
                            key={`${aid}-${bid}`}
                            x1={px(a.x)} y1={py(a.y)}
                            x2={px(b.x)} y2={py(b.y)}
                            stroke={isActive ? '#7d9a72' : '#1f2219'}
                            strokeWidth={isActive ? 1.5 : 1}
                            strokeDasharray={isActive ? 'none' : '4 3'}
                            opacity={isActive ? 0.9 : 0.5}
                            style={{ transition: 'stroke 200ms, opacity 200ms' }}
                        />
                    );
                })}

                {/* Nodes */}
                {NODES.map(n => {
                    const isActive = active === n.id;
                    const isYou = n.id === 'a';
                    return (
                        <g key={n.id}
                           transform={`translate(${px(n.x)},${py(n.y)})`}
                           onMouseEnter={() => setActive(n.id)}
                           onMouseLeave={() => setActive(null)}
                           style={{ cursor: 'default' }}>
                            {isYou && <circle r="22" fill="url(#ng)" />}
                            <circle
                                r={isYou ? 10 : 7}
                                fill={isYou ? '#7d9a72' : (isActive ? '#7d9a72' : '#131510')}
                                stroke={isYou ? '#7d9a72' : (isActive ? '#7d9a72' : '#282d20')}
                                strokeWidth={isYou ? 0 : 1.5}
                                style={{ transition: 'all 180ms' }}
                            />
                            <text
                                y={isYou ? 20 : 17}
                                textAnchor="middle"
                                fontSize={isYou ? 9 : 8}
                                fontWeight={isYou ? 700 : 500}
                                fill={isYou ? '#7d9a72' : (isActive ? '#e0e0e0' : '#888')}
                                fontFamily="Space Mono, monospace"
                                style={{ transition: 'fill 180ms', pointerEvents: 'none' }}>
                                {n.label}
                            </text>
                            <text
                                y={isYou ? 29 : 25}
                                textAnchor="middle"
                                fontSize="7"
                                fill="#444"
                                fontFamily="Space Mono, monospace"
                                style={{ pointerEvents: 'none' }}>
                                {n.sub}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div className="nw-topology-hint">hover a node to highlight its connections</div>
        </div>
    );
}

// ─── Protocol Stack ───────────────────────────────────────────────────────────
function ProtocolStack() {
    return (
        <div className="nw-stack">
            {STACK.map((layer, i) => (
                <div key={i} className="nw-stack-row" style={{ '--lc': layer.color }}>
                    <div className="nw-stack-bar" />
                    <div className="nw-stack-label">{layer.label}</div>
                    <div className="nw-stack-sub">{layer.sub}</div>
                </div>
            ))}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NetworkPage() {
    return (
        <div className="nw-page">
            {/* Header */}
            <div className="nw-header">
                <div className="nw-header-eyebrow">SYSTEM ARCHITECTURE</div>
                <h1 className="nw-header-title">How MeshTalk Works</h1>
                <p className="nw-header-sub">
                    Fully local, fully encrypted — no cloud, no accounts, no data leaving your network.
                </p>
            </div>

            {/* Topology + Stack side by side */}
            <div className="nw-two-col">
                <div className="nw-section">
                    <div className="nw-section-label">MESH TOPOLOGY</div>
                    <TopologyMap />
                </div>
                <div className="nw-section">
                    <div className="nw-section-label">PROTOCOL STACK</div>
                    <ProtocolStack />
                </div>
            </div>

            {/* Concept cards */}
            <div className="nw-section">
                <div className="nw-section-label">KEY CONCEPTS</div>
                <div className="nw-concepts-grid">
                    {CONCEPTS.map((c, i) => (
                        <div key={i} className="nw-concept-card">
                            <div className="nw-concept-header">
                                <div className="nw-concept-icon">{c.icon}</div>
                                <div>
                                    <div className="nw-concept-tag">{c.tag}</div>
                                    <div className="nw-concept-title">{c.title}</div>
                                </div>
                            </div>
                            <p className="nw-concept-body">{c.body}</p>
                            <div className="nw-concept-proto">{c.proto}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Data flow strip */}
            <div className="nw-section">
                <div className="nw-section-label">MESSAGE LIFECYCLE</div>
                <div className="nw-flow">
                    {[
                        'Type message',
                        'AES-256-GCM encrypt',
                        'TCP frame + send',
                        'Peer receives',
                        'Decrypt + display',
                        'SQLite persist',
                    ].map((step, i, arr) => (
                        <React.Fragment key={i}>
                            <div className="nw-flow-step">{step}</div>
                            {i < arr.length - 1 && <div className="nw-flow-arrow">→</div>}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
