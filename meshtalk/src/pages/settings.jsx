// src/pages/settings.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import * as api from '../lib/api';
import * as chatLogger from '../lib/chatLogger';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
}

async function detectLocalIp() {
    try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return new Promise(resolve => {
            const found = new Set();
            pc.onicecandidate = e => {
                if (!e.candidate) { pc.close(); resolve(found.size ? [...found][0] : null); return; }
                const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
                if (m?.[1] && !m[1].startsWith('169.254') && m[1] !== '127.0.0.1') found.add(m[1]);
            };
            setTimeout(() => { pc.close(); resolve(found.size ? [...found][0] : null); }, 1500);
        });
    } catch { return null; }
}

function StorageBar({ label, size, totalSize, color }) {
    const pct = totalSize > 0 ? Math.min((size / totalSize) * 100, 100) : 0;
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: 'var(--text)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)', fontSize: 11 }}>{formatBytes(size)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: color, transition: 'width 0.5s ease' }} />
            </div>
        </div>
    );
}

function StorageSection() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try { setStats(await api.getStorageStats()); }
            catch (e) { console.error('storage stats:', e); }
            finally { setLoading(false); }
        })();
    }, []);

    if (loading) return <div className="empty-state-sm">Calculating…</div>;
    if (!stats) return <div className="empty-state-sm">Unable to load storage info</div>;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{formatBytes(stats.total_size)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>total storage used</div>
                </div>
            </div>
            <StorageBar label="Database" size={stats.db_size} totalSize={stats.total_size} color="var(--accent)" />
            <StorageBar label="Shared Files" size={stats.shared_files_size} totalSize={stats.total_size} color="#60a5fa" />
            <StorageBar label="Downloads" size={stats.downloads_size} totalSize={stats.total_size} color="#a78bfa" />
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {stats.db_path && <div><span style={{ color: 'var(--text)' }}>DB: </span>{stats.db_path}</div>}
                {stats.shared_files_path && <div><span style={{ color: 'var(--text)' }}>Cache: </span>{stats.shared_files_path}</div>}
                {stats.downloads_path && <div><span style={{ color: 'var(--text)' }}>Downloads: </span>{stats.downloads_path}</div>}
            </div>
        </div>
    );
}

function NetworkInfoSection() {
    const { deviceId, peers } = useAppContext();
    const [localIp, setLocalIp] = useState(null);

    useEffect(() => {
        detectLocalIp().then(setLocalIp);
    }, []);

    const shortId = deviceId ? deviceId.slice(0, 8) + '…' + deviceId.slice(-4) : '—';

    return (
        <>
            <div className="settings-row">
                <span className="settings-label">Your IP</span>
                <span className="settings-value" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>
                    {localIp || 'detecting…'}
                </span>
            </div>
            <div className="settings-row">
                <span className="settings-label">Device ID</span>
                <span className="settings-value" title={deviceId} style={{ fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer' }}
                    onClick={() => deviceId && navigator.clipboard.writeText(deviceId)}>
                    {shortId}
                </span>
            </div>
            <div className="settings-row">
                <span className="settings-label">Discovery Port</span>
                <span className="settings-value" style={{ fontFamily: 'var(--mono)' }}>15353 UDP</span>
            </div>
            <div className="settings-row">
                <span className="settings-label">Signaling Port</span>
                <span className="settings-value" style={{ fontFamily: 'var(--mono)' }}>45678 UDP</span>
            </div>
            <div className="settings-row">
                <span className="settings-label">Peers Online</span>
                <span className="settings-value" style={{ fontFamily: 'var(--mono)', color: peers?.length ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {peers?.length || 0}
                </span>
            </div>
        </>
    );
}

function ChatLogsSection() {
    const [loggingEnabled, setLoggingEnabled] = useState(chatLogger.isEnabled());
    const [logs, setLogs] = useState([]);
    const [showLogs, setShowLogs] = useState(false);
    const [filter, setFilter] = useState('all');

    const refreshLogs = useCallback(() => setLogs(chatLogger.getLogs()), []);

    useEffect(() => { if (showLogs) refreshLogs(); }, [showLogs, refreshLogs]);

    const typeColors = { send:'var(--accent)', receive:'#60a5fa', relay:'#a78bfa', ack:'#34d399', flush:'var(--warning)', error:'var(--danger)', profile:'#f472b6', discovery:'#818cf8', info:'var(--text-muted)' };
    const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.type === filter);

    return (
        <div>
            <div className="settings-row clickable" onClick={() => { chatLogger.setEnabled(!loggingEnabled); setLoggingEnabled(!loggingEnabled); }}>
                <span className="settings-label">Enable chat logging</span>
                <div className={`toggle-switch ${loggingEnabled ? 'active' : ''}`}><div className="toggle-knob" /></div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn-sm btn-secondary" onClick={() => { setShowLogs(!showLogs); if (!showLogs) refreshLogs(); }}>
                    {showLogs ? 'Hide' : `View (${chatLogger.getLogs().length})`}
                </button>
                {showLogs && <>
                    <button className="btn-sm btn-secondary" onClick={refreshLogs}>Refresh</button>
                    <button className="btn-sm btn-secondary" onClick={() => {
                        const blob = new Blob([chatLogger.exportLogsAsJson()], { type: 'application/json' });
                        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `meshtalk_logs_${Date.now()}.json` });
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    }}>Export</button>
                    <button className="btn-sm btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => { chatLogger.clearLogs(); setLogs([]); }}>Clear</button>
                </>}
            </div>
            {showLogs && (
                <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                        {['all','send','receive','relay','ack','error'].map(f => (
                            <button key={f} onClick={() => setFilter(f)} style={{
                                padding: '3px 8px', fontSize: 10, borderRadius: 20, fontFamily: 'var(--mono)',
                                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                                background: filter === f ? 'var(--accent-dim)' : 'transparent',
                                color: filter === f ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
                            }}>{f}</button>
                        ))}
                    </div>
                    <div style={{ maxHeight: 300, overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 10 }}>
                        {filteredLogs.length === 0
                            ? <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>no logs</div>
                            : filteredLogs.slice(-200).reverse().map((entry, i) => (
                                <div key={i} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(entry.ts).toLocaleTimeString()}</span>
                                    <span style={{ flexShrink: 0, padding: '1px 5px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', fontSize: 9, background: (typeColors[entry.type] || 'var(--text-muted)') + '22', color: typeColors[entry.type] || 'var(--text-muted)' }}>{entry.type}</span>
                                    <span style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{entry.message}{entry.data && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{JSON.stringify(entry.data)}</span>}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function UsersList() {
    const { deviceId } = useAppContext();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        api.getAllUsers().then(all => { if (mounted) setUsers(all || []); }).catch(console.error).finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, []);

    const handleDelete = async (user) => {
        if (user.id === deviceId) return;
        if (!window.confirm(`Delete "${user.username}"? Their messages will also be removed.`)) return;
        try { await api.deleteUser(user.id); setUsers(p => p.filter(u => u.id !== user.id)); }
        catch (e) { alert('Failed: ' + e); }
    };

    if (loading) return <div className="empty-state-sm">Loading…</div>;
    if (!users.length) return <div className="empty-state-sm">No users stored.</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {users.map(u => (
                <div key={u.id} className="settings-row" style={{ alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{u.id.slice(0, 16)}…</div>
                    </div>
                    <button className="btn-secondary btn-sm" onClick={() => handleDelete(u)} disabled={u.id === deviceId}
                        style={{ color: u.id === deviceId ? 'var(--text-muted)' : 'var(--danger)', borderColor: u.id === deviceId ? 'var(--border)' : 'var(--danger-dim)' }}>
                        {u.id === deviceId ? 'You' : 'Delete'}
                    </button>
                </div>
            ))}
        </div>
    );
}

export default function SettingsPage() {
    const { localUser, updateProfile, deviceId } = useAppContext();
    const [notifMuted, setNotifMuted] = useState(false);

    useEffect(() => {
        api.isNotificationsMuted().then(m => setNotifMuted(!!m)).catch(() => {});
    }, []);

    const handleToggleNotif = useCallback(async () => {
        const result = await api.toggleNotificationsMute();
        setNotifMuted(result);
    }, []);

    return (
        <div className="settings-page">
            <div className="settings-container">
                <h2>Settings</h2>

                {/* ── Profile ── */}
                <section className="settings-section">
                    <h3>Profile</h3>
                    <div className="settings-row">
                        <span className="settings-label">Username</span>
                        <span className="settings-value">{localUser?.username || '—'}</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Device ID</span>
                        <span className="settings-value" style={{ fontFamily: 'var(--mono)', fontSize: 10 }} title={deviceId}>
                            {deviceId ? `${deviceId.slice(0,20)}…` : '—'}
                        </span>
                    </div>
                    {localUser?.bio && (
                        <div className="settings-row">
                            <span className="settings-label">Bio</span>
                            <span className="settings-value">{localUser.bio}</span>
                        </div>
                    )}
                </section>

                {/* ── Network ── */}
                <section className="settings-section">
                    <h3>Network</h3>
                    <NetworkInfoSection />
                </section>

                {/* ── Notifications ── */}
                <section className="settings-section">
                    <h3>Notifications</h3>
                    <div className="settings-row clickable" onClick={handleToggleNotif}>
                        <span className="settings-label">Mute all notifications</span>
                        <div className={`toggle-switch ${notifMuted ? 'active' : ''}`}><div className="toggle-knob" /></div>
                    </div>
                </section>

                {/* ── Storage ── */}
                <section className="settings-section">
                    <h3>Storage & Data</h3>
                    <StorageSection />
                </section>

                {/* ── Chat Logs ── */}
                <section className="settings-section">
                    <h3>Chat Logs</h3>
                    <ChatLogsSection />
                </section>

                {/* ── Users ── */}
                <section className="settings-section">
                    <h3>Users</h3>
                    <UsersList />
                </section>

                {/* ── Danger Zone ── */}
                <section className="settings-section" style={{ borderColor: 'rgba(255,68,68,0.25)' }}>
                    <h3 style={{ color: 'var(--danger)' }}>Danger Zone</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="settings-row">
                            <div>
                                <div className="settings-label">Clear all chat history</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Permanently deletes all messages</div>
                            </div>
                            <button className="btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-dim)' }}
                                onClick={async () => {
                                    if (!window.confirm('Delete ALL messages? This cannot be undone.')) return;
                                    const users = await api.getAllUsers().catch(() => []);
                                    for (const u of users) await api.deleteAllMessagesWithPeer(u.id).catch(() => {});
                                }}>
                                Clear chats
                            </button>
                        </div>
                    </div>
                </section>

                {/* ── About ── */}
                <section className="settings-section">
                    <h3>About</h3>
                    <div className="settings-row">
                        <span className="settings-label">Version</span>
                        <span className="settings-value" style={{ fontFamily: 'var(--mono)' }}>0.1.0</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Encryption</span>
                        <span className="settings-value" style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>x25519 + aes-256-gcm</span>
                    </div>
                    <div className="settings-row">
                        <span className="settings-label">Transport</span>
                        <span className="settings-value" style={{ fontFamily: 'var(--mono)' }}>LAN · UDP · no relay</span>
                    </div>
                </section>
            </div>
        </div>
    );
}
