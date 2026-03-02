import React from 'react';
import { Activity, X, Minus, Square } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const appWindow = getCurrentWindow();

    return (
        <div className="flex flex-col w-screen h-screen overflow-hidden bg-background text-foreground">

            {/* Frameless Window Titlebar */}
            <div
                data-tauri-drag-region
                className="h-10 flex items-center justify-between px-4 bg-panel/40 backdrop-blur-md border-b border-white/5 select-none tauri-drag-region shrink-0"
            >
                <div data-tauri-drag-region className="flex items-center gap-3 pl-2 pointer-events-none tauri-drag-region">
                    <Activity className="w-4 h-4 text-primary" />
                    <span className="text-white/50 text-[11px] font-bold tracking-widest uppercase">
                        AudioScribe Studio
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => appWindow.minimize()} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => appWindow.toggleMaximize()} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <Square className="w-3 h-3" />
                    </button>
                    <button onClick={() => appWindow.close()} className="p-1.5 rounded-md hover:bg-danger/80 hover:text-white text-white/40 transition-colors">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* App Content */}
            <main className="flex-1 flex overflow-hidden relative">
                {children}
            </main>
        </div>
    );
};
