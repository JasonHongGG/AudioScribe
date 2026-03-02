import React, { useEffect, useState, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { motion } from 'framer-motion';

export const LogViewer: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sse = new EventSource('http://127.0.0.1:8000/stream-logs');

        sse.onmessage = (e) => {
            setLogs((prev) => [...prev, e.data].slice(-100)); // Keep last 100 lines
        };

        sse.onerror = () => {
            console.debug("SSE disconnected, will retry automatically...");
        };

        return () => {
            sse.close();
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    if (logs.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-2xl glass-panel border border-white/10 overflow-hidden flex flex-col h-48"
        >
            <div className="h-8 bg-black/40 border-b border-white/5 flex items-center px-4 gap-2">
                <Terminal className="w-3.5 h-3.5 text-white/40" />
                <span className="text-xs font-mono text-white/40 uppercase tracking-widest">Global Terminal</span>
            </div>
            <div
                ref={scrollRef}
                className="flex-1 p-4 overflow-y-auto font-mono text-xs text-white/60 space-y-1 scroll-smooth"
            >
                {logs.map((log, i) => (
                    <div key={i} className="break-all">{log}</div>
                ))}
            </div>
        </motion.div>
    );
};
