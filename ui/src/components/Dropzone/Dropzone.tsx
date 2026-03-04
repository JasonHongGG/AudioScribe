import { useEffect, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud } from 'lucide-react';
import { useStore, FileTask } from '../../store';

export function Dropzone() {
    const [isDragging, setIsDragging] = useState(false);
    const addTask = useStore((state) => state.addTask);

    useEffect(() => {
        let isMounted = true;
        let unlistenEnter: UnlistenFn | undefined;
        let unlistenLeave: UnlistenFn | undefined;
        let unlistenDrop: UnlistenFn | undefined;

        const setupListeners = async () => {
            try {
                const ue = await listen('tauri://drag-enter', () => {
                    setIsDragging(true);
                });
                if (isMounted) unlistenEnter = ue; else ue();

                const ul = await listen('tauri://drag-leave', () => {
                    setIsDragging(false);
                });
                if (isMounted) unlistenLeave = ul; else ul();

                // The drop event payload type depends on Tauri v2 (tauri://drag-drop)
                const ud = await listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
                    setIsDragging(false);

                    if (event.payload && event.payload.paths && Array.isArray(event.payload.paths)) {
                        const validExtensions = ['.mp3', '.wav', '.mp4', '.mkv', '.ogg', '.flac', '.m4a'];

                        event.payload.paths.forEach((path) => {
                            const lowerPath = path.toLowerCase();
                            if (validExtensions.some(ext => lowerPath.endsWith(ext))) {
                                // Extract filename from path
                                const name = path.split(/[/\\]/).pop() || 'Unknown File';

                                const newTask: FileTask = {
                                    id: Math.random().toString(36).substring(7),
                                    file: null,
                                    file_path: path,
                                    name: name,
                                    status: 'ready',
                                    progress: 0,
                                    provider: 'faster-whisper',
                                    modelSize: 'base',
                                    segments: null,
                                    trimRange: null,
                                };
                                addTask(newTask);
                            }
                        });
                    }
                });
                if (isMounted) unlistenDrop = ud; else ud();

            } catch (error) {
                console.error("Failed to setup drag-drop listeners:", error);
            }
        };

        setupListeners();

        return () => {
            isMounted = false;
            if (unlistenEnter) unlistenEnter();
            if (unlistenLeave) unlistenLeave();
            if (unlistenDrop) unlistenDrop();
        };
    }, [addTask]);

    return (
        <AnimatePresence>
            {isDragging && (
                <motion.div
                    initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
                    exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background-base/50 border-[2px] border-primary/50 shadow-[inset_0_0_150px_rgba(250,204,21,0.15)] pointer-events-auto"
                >
                    <motion.div
                        initial={{ scale: 0.85, y: 20, filter: 'blur(10px)' }}
                        animate={{ scale: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ scale: 1.05, opacity: 0, filter: 'blur(10px)' }}
                        transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
                        className="flex flex-col items-center justify-center p-12 pr-12 rounded-[2.5rem] bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-3xl border border-white/10 box-glow"
                    >
                        <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-primary/30 to-primary/5 flex items-center justify-center mb-8 border border-primary/40 relative shadow-2xl">
                            <UploadCloud className="w-12 h-12 text-primary drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]" />
                            {/* Expanding Ripple Circles */}
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-primary/60 pointer-events-none"
                                animate={{ scale: [1, 1.8], opacity: [1, 0] }}
                                transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
                            />
                            <motion.div
                                className="absolute inset-0 rounded-full border border-primary/30 pointer-events-none"
                                animate={{ scale: [1, 2.2], opacity: [0.8, 0] }}
                                transition={{ repeat: Infinity, duration: 2.2, ease: "easeOut", delay: 0.4 }}
                            />
                        </div>
                        <h2 className="text-4xl font-extrabold tracking-tight text-white mb-3 text-glow">
                            Drop to Import
                        </h2>
                        <p className="text-primary-light/80 font-medium text-lg font-mono tracking-widest uppercase">
                            Release to begin processing
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
