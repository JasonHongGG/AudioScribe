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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-background-base/80 backdrop-blur-sm pointer-events-auto outline-5 outline-primary -outline-offset-[5px]"
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center"
                    >
                        <UploadCloud className="w-16 h-16 text-primary mb-6 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
                        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">
                            Drop files here
                        </h2>
                        <p className="text-foreground-muted font-medium text-lg">
                            Supported formats: MP3, WAV, MP4, MKV, OGG, FLAC, M4A
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
