import { ReactNode, useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motion } from 'framer-motion';

interface MainLayoutProps {
    children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    const appWindow = getCurrentWindow();
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="flex flex-col w-screen h-screen overflow-hidden bg-background-base relative selection:bg-primary/30 selection:text-primary-light text-foreground">
            {/* Dynamic Ambient Blur Background */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                {/* Fixed Orbs */}
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] mix-blend-screen" />
                <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] rounded-full bg-primary/5 blur-[150px] mix-blend-screen" />

                {/* Mouse-following Subtle Glow */}
                <motion.div
                    className="absolute w-[600px] h-[600px] rounded-full bg-white/[0.015] blur-[100px] mix-blend-screen"
                    animate={{
                        x: mousePos.x - 300,
                        y: mousePos.y - 300,
                    }}
                    transition={{ type: "tween", ease: "easeOut", duration: 1.5 }}
                />

                {/* Grain Overlay for Texture */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay z-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
            </div>

            {/* Seamless Titlebar / Drag Region */}
            <div
                data-tauri-drag-region
                className="flex items-center justify-between h-12 px-5 select-none z-50 bg-transparent relative"
            >
                <div
                    data-tauri-drag-region
                    className="flex items-center gap-3 pointer-events-none"
                >
                    <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                    <span className="font-semibold tracking-widest text-xs uppercase text-foreground/90 font-mono">
                        AudioScribe
                    </span>
                </div>

                {/* Window Controls */}
                <div className="flex items-center gap-1.5 text-foreground-muted" data-tauri-drag-region="false">
                    <button
                        onClick={() => { appWindow.minimize().catch(console.error); }}
                        className="tauri-no-drag flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                        title="Minimize"
                    >
                        <Minus size={15} />
                    </button>
                    <button
                        onClick={() => { appWindow.toggleMaximize().catch(console.error); }}
                        className="tauri-no-drag flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 hover:text-white transition-all cursor-pointer"
                        title="Maximize"
                    >
                        <Square size={13} />
                    </button>
                    <button
                        onClick={() => { appWindow.close().catch(console.error); }}
                        className="tauri-no-drag flex items-center justify-center w-8 h-8 rounded-full hover:bg-danger/80 hover:text-white transition-all cursor-pointer"
                        title="Close"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative overflow-hidden flex flex-row z-10 pt-2 pb-4 px-4 gap-4">
                {children}
            </div>
        </div>
    );
}
