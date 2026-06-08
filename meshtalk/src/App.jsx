// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from './context/AppContext';
import Aside from './components/Aside';
import TitleBar from './components/TitleBar';
import MeshBackground from './components/MeshBackground';
import ChatPage from './pages/chat';
import MeetingsPage from './pages/meetings';
import NotesPage from './pages/notes';
import SettingsPage from './pages/settings';
import NetworkPage from './pages/network';
import NotificationCenter from './components/NotificationCenter';
import './App.css';

// ─── Error Boundary ───────────────────────────────────────────
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('[MeshTalk] Render error:', error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <h3>Something went wrong</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button className="btn-primary" onClick={() => this.setState({ hasError: false, error: null })}>
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Loading Screen ───────────────────────────────────────────
function LoadingScreen() {
    return (
        <div className="loading-screen">
            <div className="loading-mesh-dot" />
            <div className="loading-dot-ring" />
            <p>initializing mesh…</p>
        </div>
    );
}

// ─── Welcome Hero (Screen 1) ──────────────────────────────────
function WelcomeScreen({ onGetStarted }) {
    return (
        <div className="welcome-screen">
            <MeshBackground dotCount={90} speed={0.4} lineAlpha={0.22} dotAlpha={0.55} maxDist={180} dotRadius={2.5} />
            <div className="welcome-grid-overlay" />
            <div className="welcome-content">
                <div className="welcome-eyebrow">LOCAL MESH NETWORK / v0.1.0</div>
                <div className="welcome-logo">
                    <div className="welcome-logo-dot" />
                    <span className="welcome-wordmark">MeshTalk</span>
                </div>
                <div className="welcome-tagline">Encrypted. Local. Yours.</div>
                <ul className="welcome-features">
                    <li><span className="wf-caret">›</span>No servers. No cloud. No accounts.</li>
                    <li><span className="wf-caret">›</span>End-to-end encrypted by default.</li>
                    <li><span className="wf-caret">›</span>Mesh routing — works even without internet.</li>
                    <li><span className="wf-caret">›</span>Your data never leaves your network.</li>
                </ul>
                <button className="welcome-cta" onClick={onGetStarted}>
                    Enter the mesh <span className="welcome-cta-arrow">→</span>
                </button>
                <div className="welcome-footer-hint">LAN · Wi-Fi · Peer-to-Peer · Open Source</div>
            </div>
        </div>
    );
}

// ─── Setup Screen (Screen 2) ──────────────────────────────────
function SetupScreen({ onComplete }) {
    const [username, setUsername] = React.useState('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (username.trim()) onComplete(username.trim());
    };
    return (
        <div className="setup-screen">
            <MeshBackground dotCount={50} speed={0.25} lineAlpha={0.12} dotAlpha={0.3} />
            <div className="setup-card">
                <div className="setup-card-accent" />
                <div className="setup-card-label">IDENTITY</div>
                <h1>What should we call you?</h1>
                <p>shown to peers on your local network</p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder="your name…"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        autoFocus
                        maxLength={30}
                        spellCheck={false}
                    />
                    <button className="btn-primary" type="submit" disabled={!username.trim()}>
                        Enter the mesh →
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── Status Bar ───────────────────────────────────────────────
function AppStatusBar() {
    const { peers, localUser } = useAppContext();
    const peerCount = (peers || []).length;
    return (
        <div className="app-status-bar">
            <div className="status-bar-left">
                <span className="status-bar-dot" />
                <span>mesh active</span>
                {peerCount > 0 && <><span className="status-bar-sep">·</span><span>{peerCount} node{peerCount !== 1 ? 's' : ''} visible</span></>}
            </div>
            <div className="status-bar-center">e2e encrypted · local network</div>
            <div className="status-bar-right">{localUser?.ip || 'discovering…'}</div>
        </div>
    );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
    const { initialized, localUser, updateProfile } = useAppContext();
    // Show welcome on every fresh session
    const [welcomed, setWelcomed] = React.useState(
        () => !!sessionStorage.getItem('mt_welcomed')
    );

    if (!initialized) return <LoadingScreen />;

    if (!welcomed) {
        return (
            <>
                <TitleBar />
                <WelcomeScreen onGetStarted={() => {
                    sessionStorage.setItem('mt_welcomed', '1');
                    setWelcomed(true);
                }} />
            </>
        );
    }

    if (!localUser || !localUser.username) {
        return (
            <>
                <TitleBar />
                <SetupScreen onComplete={async (name) => {
                    await updateProfile({ username: name });
                }} />
            </>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <TitleBar />
            <div className="app-shell">
                <Aside />
                <main className="main-content">
                    <ErrorBoundary>
                        <Routes>
                            <Route path="/" element={<Navigate to="/chat" replace />} />
                            <Route path="/chat" element={<ChatPage />} />
                            <Route path="/meetings" element={<MeetingsPage />} />
                            <Route path="/notes" element={<NotesPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/network" element={<NetworkPage />} />
                        </Routes>
                    </ErrorBoundary>
                </main>
            </div>
            <AppStatusBar />
            <NotificationCenter />
        </div>
    );
}




