import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { save } from '@tauri-apps/plugin-dialog';
import { AlertCircle, FileOutput, FolderOpen, Loader2, ScrollText, X } from 'lucide-react';
import type { WorkbenchEntry } from '../workbench/models';
import {
    exportTranscriptDocument,
    loadTranscriptDocument,
    revealTranscriptDocument,
    type TranscriptDocument,
} from './transcript';


interface TranscriptResultPanelProps {
    entry: WorkbenchEntry;
    isOpen: boolean;
    onClose: () => void;
}


function filenameFromEntry(entry: WorkbenchEntry): string {
    const sourceName = entry.asset.name.replace(/\.[^.]+$/, '');
    return `${sourceName}.txt`;
}


export function TranscriptResultPanel({ entry, isOpen, onClose }: TranscriptResultPanelProps) {
    const transcriptPath = entry.latestRun?.artifact?.path ?? null;
    const runId = entry.latestRun?.runId ?? null;
    const [document, setDocument] = useState<TranscriptDocument | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    const canLoadTranscript = entry.latestRun?.status === 'completed' && !!runId;

    useEffect(() => {
        let cancelled = false;
        let intervalId: number | undefined;

        async function readTranscript(showLoader: boolean) {
            if (!isOpen || !canLoadTranscript || !runId) {
                setDocument(null);
                setError(null);
                setIsLoading(false);
                return;
            }

            if (showLoader) {
                setIsLoading(true);
            }
            setError(null);

            try {
                const nextDocument = await loadTranscriptDocument(runId);
                if (!cancelled) {
                    setDocument((current) => {
                        if (current?.path === nextDocument.path && current.content === nextDocument.content) {
                            return current;
                        }
                        return nextDocument;
                    });
                }
            } catch (loadError) {
                if (!cancelled) {
                    setDocument(null);
                    setError(loadError instanceof Error ? loadError.message : String(loadError));
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        void readTranscript(true);

        if (isOpen && canLoadTranscript && runId) {
            intervalId = window.setInterval(() => {
                void readTranscript(false);
            }, 1500);
        }

        return () => {
            cancelled = true;
            if (intervalId !== undefined) {
                window.clearInterval(intervalId);
            }
        };
    }, [isOpen, canLoadTranscript, runId]);

    const handleReveal = async () => {
        if (!transcriptPath) {
            return;
        }
        setActionError(null);
        try {
            await revealTranscriptDocument(transcriptPath);
        } catch (revealError) {
            setActionError(revealError instanceof Error ? revealError.message : String(revealError));
        }
    };

    const handleExport = async () => {
        if (!runId) {
            return;
        }

        setActionError(null);
        const destination = await save({
            defaultPath: filenameFromEntry(entry),
            filters: [{ name: 'Text', extensions: ['txt'] }],
        });

        if (!destination) {
            return;
        }

        setIsExporting(true);
        try {
            await exportTranscriptDocument(runId, destination);
        } catch (exportError) {
            setActionError(exportError instanceof Error ? exportError.message : String(exportError));
        } finally {
            setIsExporting(false);
        }
    };

    const renderBody = () => {
        if (entry.latestRun?.status === 'failed' || entry.latestRun?.status === 'cancelled') {
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4 text-foreground-muted">
                    <AlertCircle size={28} className="text-danger" />
                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Transcription failed</div>
                        <p className="text-sm leading-relaxed">{entry.latestRun?.errorMessage ?? 'The audio engine did not produce a transcript for this asset.'}</p>
                    </div>
                </div>
            );
        }

        if (entry.latestRun?.status !== 'completed') {
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4 text-foreground-muted">
                    <ScrollText size={28} className="text-primary/70" />
                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Transcript result</div>
                        <p className="text-sm leading-relaxed">Run a workflow and the generated transcript will appear here.</p>
                    </div>
                </div>
            );
        }

        if (isLoading) {
            return (
                <div className="flex-1 flex items-center justify-center text-foreground-muted gap-3">
                    <Loader2 size={20} className="animate-spin text-primary" />
                    <span className="text-sm">Loading transcript preview</span>
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4 text-foreground-muted">
                    <AlertCircle size={28} className="text-danger" />
                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">Failed to read transcript</div>
                        <p className="text-sm leading-relaxed break-words">{error}</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex-1 min-h-0 px-4 pt-0.5 pb-2.5">
                <div className="h-full rounded-[1.35rem] border border-white/[0.05] bg-background-base/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] overflow-hidden">
                    <div className="h-full overflow-y-auto px-5 pt-2.5 pb-16">
                        <pre className="whitespace-pre-wrap break-words text-[13px] leading-[1.65] text-foreground/90 font-mono">{document?.content || 'Transcript is empty.'}</pre>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Close transcript panel"
                        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                    />

                    <motion.aside
                        className="absolute left-1/2 bottom-[7.9rem] w-[95%] max-w-[1000px] z-40"
                        initial={{ opacity: 0, y: 24, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 24, x: '-50%' }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                    >
                        <div className="h-[14.8rem] rounded-t-[2rem] rounded-b-[1rem] border border-white/[0.08] border-b-white/[0.03] bg-background-base/95 backdrop-blur-3xl shadow-[0_25px_80px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden flex flex-col">
                            <div className="px-5 py-1.5 border-b border-white/[0.05] bg-black/22 shrink-0">
                                <div className="flex items-center justify-between gap-4 min-h-7">
                                    <div className="text-[10px] leading-none uppercase tracking-[0.24em] text-foreground-muted">Transcript result</div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => { void handleReveal(); }}
                                            disabled={!transcriptPath}
                                            className="glass-button p-2 text-foreground-muted hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            title="Reveal transcript file"
                                        >
                                            <FolderOpen size={15} />
                                        </button>
                                        <button
                                            onClick={() => { void handleExport(); }}
                                            disabled={!runId || isExporting}
                                            className="glass-button p-2 text-foreground-muted hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            title="Export transcript copy"
                                        >
                                            {isExporting ? <Loader2 size={15} className="animate-spin" /> : <FileOutput size={15} />}
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="glass-button p-2 text-foreground-muted hover:text-foreground"
                                            title="Close transcript panel"
                                        >
                                            <X size={15} />
                                        </button>
                                    </div>
                                </div>

                                {actionError && <div className="mt-1 text-[11px] leading-relaxed text-danger break-words">{actionError}</div>}
                            </div>

                            {renderBody()}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}