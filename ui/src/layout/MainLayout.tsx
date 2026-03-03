import { ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface MainLayoutProps {
    children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    const appWindow = getCurrentWindow();
    return (
        <div className="flex flex-col w-screen h-screen overflow-hidden bg-background">
            {/* Titlebar / Drag Region */}
            <div
                data-tauri-drag-region
                className="flex items-center justify-between h-10 px-4 select-none glass-panel border-b border-white/5"
            >
                <div className="flex items-center gap-2 pointer-events-none text-primary font-semibold tracking-wide text-xs">
                    AudioScribe
                </div>

                {/* Window Controls */}
                <div className="flex text-foreground-muted" data-tauri-drag-region="false">
                    <button
                        onClick={() => { appWindow.minimize().catch(console.error); }}
                        className="tauri-no-drag flex items-center justify-center w-10 h-10 hover:bg-surface transition-colors cursor-pointer"
                        title="Minimize"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={() => { appWindow.toggleMaximize().catch(console.error); }}
                        className="tauri-no-drag flex items-center justify-center w-10 h-10 hover:bg-surface transition-colors cursor-pointer"
                        title="Maximize"
                    >
                        <Square size={13} />
                    </button>
                    <button
                        onClick={() => { appWindow.close().catch(console.error); }}
                        className="tauri-no-drag flex items-center justify-center w-10 h-10 hover:bg-danger hover:text-white transition-colors cursor-pointer"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden flex flex-row">
                {children}
            </div>
        </div>
    );
}
