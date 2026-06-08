// Custom Tauri titlebar — no native decorations
import { useCallback } from 'react';

async function getWin() {
    try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return getCurrentWindow();
    } catch { return null; }
}

export default function TitleBar() {
    const close = useCallback(async () => { const w = await getWin(); w?.close(); }, []);
    const minimize = useCallback(async () => { const w = await getWin(); w?.minimize(); }, []);
    const maximize = useCallback(async () => {
        const w = await getWin();
        if (!w) return;
        const full = await w.isFullscreen();
        await w.setFullscreen(!full);
    }, []);

    return (
        <div className="titlebar" data-tauri-drag-region>
            <div className="titlebar-controls">
                <button className="titlebar-btn titlebar-close" onClick={close} title="Close" />
                <button className="titlebar-btn titlebar-minimize" onClick={minimize} title="Minimize" />
                <button className="titlebar-btn titlebar-maximize" onClick={maximize} title="Maximize" />
            </div>
            <span className="titlebar-name">MeshTalk</span>
            <div style={{ width: 68 }} />
        </div>
    );
}
