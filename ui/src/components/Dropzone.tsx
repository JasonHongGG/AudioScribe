import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileAudio, Video } from 'lucide-react';
import { useStore } from '../store';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import clsx from 'clsx';

export const Dropzone: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
    const [isDragging, setIsDragging] = useState(false);
    const addTask = useStore((s: any) => s.addTask);

    useEffect(() => {
        let unlistenPromises: Promise<UnlistenFn>[] = [];

        const setupTauriDrops = () => {
            try {
                unlistenPromises.push(listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
                    setIsDragging(false);
                    const paths = event.payload.paths || (event.payload as unknown as string[]);

                    if (Array.isArray(paths)) {
                        paths.forEach((path: string) => {
                            const name = path.split(/[\\/]/).pop() || path;
                            if (name.match(/\.(mp3|wav|m4a|flac|aac|ogg|mp4|mkv|mov|avi)$/i)) {
                                addTask({ file: null, path, name });
                            }
                        });
                    }
                }));

                unlistenPromises.push(listen('tauri://drag-enter', () => setIsDragging(true)));
                unlistenPromises.push(listen('tauri://drag-leave', () => setIsDragging(false)));
            } catch (e) {
                console.warn("Tauri event listen failed, likely running in pure web mode", e);
            }
        };

        setupTauriDrops();

        return () => {
            unlistenPromises.forEach(p => p.then(fn => fn()).catch(() => { }));
        };
    }, [addTask]);

    return (
        <>
            {!hidden && (
                <div className="relative w-full h-[320px] rounded-3xl border-2 border-dashed border-white/10 glass-panel hover:border-primary/50 hover:bg-white/5 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer overflow-hidden group shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                    <input
                        type="file"
                        multiple
                        accept="audio/*,video/*,.mkv,.avi"
                        onChange={(e) => {
                            if (e.target.files) {
                                Array.from(e.target.files).forEach(f => addTask({ file: f, path: null, name: f.name }));
                            }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />

                    <div className="flex flex-col items-center gap-6 z-0 pointer-events-none">
                        <div className="flex gap-4 text-white/40 group-hover:text-primary transition-colors duration-500">
                            <FileAudio className="w-16 h-16 group-hover:-rotate-12 transition-transform" />
                            <Video className="w-16 h-16 group-hover:rotate-12 transition-transform" />
                        </div>
                        <div className="text-center space-y-3">
                            <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                                Drag & Drop Media Files
                            </h3>
                            <p className="text-base text-white/50 font-medium">
                                or click anywhere to browse
                            </p>
                            <div className="flex items-center justify-center gap-3 text-xs text-white/30 pt-4 font-mono">
                                <span className="px-2 py-1 rounded bg-black/20">MP3</span>
                                <span className="px-2 py-1 rounded bg-black/20">WAV</span>
                                <span className="px-2 py-1 rounded bg-black/20">M4A</span>
                                <span className="px-2 py-1 rounded bg-black/20">MP4</span>
                                <span className="px-2 py-1 rounded bg-black/20">MKV</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {isDragging && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={clsx(
                            "fixed inset-0 z-[200] bg-primary/20 backdrop-blur-md flex flex-col items-center justify-center border-4 border-primary transition-colors pointer-events-none",
                            hidden ? "bg-black/80" : ""
                        )}
                    >
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                        >
                            <UploadCloud className="w-40 h-40 text-primary shadow-primary drop-shadow-[0_0_40px_rgba(234,179,8,0.6)]" />
                        </motion.div>
                        <h2 className="text-4xl font-black text-white mt-10 drop-shadow-2xl tracking-tight">
                            Drop to Add to Queue
                        </h2>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
