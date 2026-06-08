import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNotes } from '../context/AppContext';
import * as api from '../lib/api';

const COLORS = ['#3ddc84', '#f59e0b', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

export default function NotesPage() {
    const { notes, loading, save, remove, togglePin } = useNotes();
    const [selectedId, setSelectedId] = useState(null);
    const [editing, setEditing]       = useState(null);
    const [search, setSearch]         = useState('');
    const [savedFlash, setSavedFlash] = useState(false);
    const saveTimer   = useRef(null);
    const editingRef  = useRef(null);
    editingRef.current = editing;

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return [...notes]
            .filter(n => !q || n.title.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q))
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
            });
    }, [notes, search]);

    const persistSave = useCallback(async (data) => {
        if (!data?.title?.trim()) return;
        const id = data.id || await api.generateUuid();
        await save({
            id,
            title:    data.title.trim(),
            content:  data.content  || '',
            color:    data.color    || COLORS[0],
            pinned:   data.pinned   || false,
            category: data.category || '',
            created_at: data.created_at || undefined,
        });
        setEditing(p => p ? { ...p, id } : p);
        setSelectedId(id);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
    }, [save]);

    const scheduleSave = useCallback(() => {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => persistSave(editingRef.current), 900);
    }, [persistSave]);

    const handleField = useCallback((field, value) => {
        setEditing(p => ({ ...p, [field]: value }));
        scheduleSave();
    }, [scheduleSave]);

    const openNote = (note) => {
        clearTimeout(saveTimer.current);
        setSelectedId(note.id);
        setEditing({ ...note });
    };

    const startNew = () => {
        clearTimeout(saveTimer.current);
        const blank = { id: '', title: '', content: '', color: COLORS[0], pinned: false, category: '' };
        setSelectedId('__new__');
        setEditing(blank);
    };

    const handleDelete = useCallback(async (id) => {
        clearTimeout(saveTimer.current);
        await remove(id);
        if (selectedId === id || selectedId === '__new__') {
            setSelectedId(null);
            setEditing(null);
        }
    }, [remove, selectedId]);

    const cycleColor = useCallback(() => {
        if (!editing) return;
        const idx = COLORS.indexOf(editing.color);
        handleField('color', COLORS[(idx + 1) % COLORS.length]);
    }, [editing, handleField]);

    // Auto-open first note on load
    useEffect(() => {
        if (!loading && notes.length > 0 && !selectedId) {
            openNote(notes[0]);
        }
    }, [loading]);

    const accentColor = editing?.color || COLORS[0];

    return (
        <div className="notes-v2">
            {/* ── Top tab bar ────────────────────────────────── */}
            <div className="notes-tabbar">
                <span className="notes-tabbar-label">NOTES</span>

                <div className="notes-tabs-scroll">
                    {filtered.map(note => (
                        <button
                            key={note.id}
                            className={`notes-tab ${selectedId === note.id ? 'active' : ''}`}
                            style={{ '--tc': note.color || COLORS[0] }}
                            onClick={() => openNote(note)}>
                            <span className="notes-tab-dot" />
                            <span className="notes-tab-name">{note.title || 'Untitled'}</span>
                            {note.pinned && <span className="notes-tab-pinned">·</span>}
                        </button>
                    ))}
                </div>

                <div className="notes-tabbar-actions">
                    <input
                        className="notes-search-mini"
                        placeholder="search…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button className="notes-new-btn" onClick={startNew} title="New note">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        New
                    </button>
                </div>
            </div>

            {/* ── Editor / Empty ──────────────────────────────── */}
            {!editing ? (
                <div className="notes-empty-v2">
                    <span className="notes-empty-blink">_</span>
                    <p>no note selected</p>
                    <button className="btn-primary btn-sm" onClick={startNew}>+ New note</button>
                </div>
            ) : (
                <div className="notes-editor-v2">
                    {/* Title row */}
                    <div className="notes-title-row">
                        <div
                            className="notes-color-pip"
                            style={{ background: accentColor }}
                            onClick={cycleColor}
                            title="Cycle color"
                        />
                        <input
                            className="notes-title-field"
                            placeholder="Note title…"
                            value={editing.title}
                            onChange={e => handleField('title', e.target.value)}
                            autoFocus
                            spellCheck={false}
                        />
                        <button
                            className={`notes-pin-btn ${editing.pinned ? 'active' : ''}`}
                            onClick={() => handleField('pinned', !editing.pinned)}
                            title={editing.pinned ? 'Unpin' : 'Pin'}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={editing.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M12 2a3 3 0 0 1 3 3v6l3 3v1H6v-1l3-3V5a3 3 0 0 1 3-3z"/>
                                <line x1="12" y1="22" x2="12" y2="17"/>
                            </svg>
                        </button>
                        {editing.id && (
                            <button
                                className="notes-del-btn"
                                onClick={() => handleDelete(editing.id)}
                                title="Delete note">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-1 14H6L5 6"/>
                                    <path d="M10 11v6M14 11v6"/>
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Color accent line under title */}
                    <div className="notes-accent-line" style={{ background: accentColor }} />

                    {/* Content */}
                    <textarea
                        className="notes-body"
                        placeholder="Start writing…"
                        value={editing.content || ''}
                        onChange={e => handleField('content', e.target.value)}
                        spellCheck={false}
                    />

                    {/* Meta bar */}
                    <div className="notes-metabar">
                        <input
                            className="notes-tag-input"
                            placeholder="tag…"
                            value={editing.category || ''}
                            onChange={e => handleField('category', e.target.value)}
                        />
                        <div className="notes-metabar-right">
                            {savedFlash && <span className="notes-saved-flash">saved</span>}
                            {editing.updated_at && (
                                <span className="notes-meta-date">
                                    {new Date(editing.updated_at).toLocaleString(undefined, {
                                        month: 'short', day: 'numeric',
                                        hour: '2-digit', minute: '2-digit',
                                    })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
