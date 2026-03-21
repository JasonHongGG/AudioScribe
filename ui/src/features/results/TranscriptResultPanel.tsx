import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { save } from '@tauri-apps/plugin-dialog';
import { AlertCircle, FileOutput, FolderOpen, GripHorizontal, Loader2, ScrollText, X } from 'lucide-react';
import type { WorkbenchEntry } from '../workbench/models';
import {
    exportTranscriptDocument,
    findActiveTranscriptCueIndex,
    revealTranscriptDocument,
} from './transcript';
import { useTranscriptDocument } from './useTranscriptDocument';


interface TranscriptResultPanelProps {
    entry: WorkbenchEntry;
    isOpen: boolean;
    height: number;
    currentTime: number;
    onSeekToTime: (value: number) => void;
    onClose: () => void;
    onResizeStart: (event: React.PointerEvent<HTMLElement>) => void;
}


function filenameFromEntry(entry: WorkbenchEntry): string {
    const sourceName = entry.asset.name.replace(/\.[^.]+$/, '');
    return `${sourceName}.txt`;
}


function compactTimestamp(label: string): string {
    return label.split('.')[0] ?? label;
}


export function TranscriptResultPanel({ entry, isOpen, height, currentTime, onSeekToTime, onClose, onResizeStart }: TranscriptResultPanelProps) {
    const transcriptPath = entry.latestRun?.artifact?.path ?? null;
    const runId = entry.latestRun?.runId ?? null;
    const [actionError, setActionError] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const cueRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const wheelDeltaAccumulatorRef = useRef(0);

    const canLoadTranscript = entry.latestRun?.status === 'completed' && !!runId;
    const { document, cues, isLoading, error } = useTranscriptDocument({
        isOpen,
        canLoad: canLoadTranscript,
        runId,
    });
    const activeCueIndex = useMemo(() => findActiveTranscriptCueIndex(cues, currentTime), [cues, currentTime]);

    const resolveCueScrollTop = (container: HTMLDivElement, cueElement: HTMLDivElement) => {
        const containerRect = container.getBoundingClientRect();
        const cueRect = cueElement.getBoundingClientRect();
        return container.scrollTop + (cueRect.top - containerRect.top);
    };

    const handleTranscriptWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const container = scrollContainerRef.current;
        if (!container || cues.length === 0) {
            return;
        }

        const deltaThreshold = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 48 : 1;

        event.preventDefault();
        wheelDeltaAccumulatorRef.current += event.deltaY;

        if (Math.abs(wheelDeltaAccumulatorRef.current) < deltaThreshold) {
            return;
        }

        const direction = Math.sign(wheelDeltaAccumulatorRef.current);
        wheelDeltaAccumulatorRef.current = 0;

        const cuePositions = cues
            .map((cue) => {
                const element = cueRefs.current[cue.id];
                if (!element) {
                    return null;
                }
                return {
                    id: cue.id,
                    top: resolveCueScrollTop(container, element),
                };
            })
            .filter((item): item is { id: string; top: number } => item !== null);

        if (cuePositions.length === 0) {
            return;
        }

        const currentTop = container.scrollTop;
        const threshold = 4;

        if (direction > 0) {
            const nextCue = cuePositions.find((cue) => cue.top > currentTop + threshold);
            container.scrollTo({ top: nextCue?.top ?? cuePositions[cuePositions.length - 1].top, behavior: 'auto' });
            return;
        }

        const previousCue = [...cuePositions].reverse().find((cue) => cue.top < currentTop - threshold);
        container.scrollTo({ top: previousCue?.top ?? cuePositions[0].top, behavior: 'auto' });
    };

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
                    <div ref={scrollContainerRef} onWheel={handleTranscriptWheel} className="h-full overflow-y-auto px-5 pt-2.5 pb-16">
                        {cues.length > 0 ? (
                            <div className="flex flex-col gap-1.5 pb-2">
                                {cues.map((cue, index) => {
                                    const isActive = index === activeCueIndex;
                                    return (
                                        <div
                                            key={cue.id}
                                            ref={(node) => {
                                                cueRefs.current[cue.id] = node;
                                            }}
                                            className={isActive
                                                ? 'grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 shadow-[0_0_18px_rgba(250,204,21,0.07)] transition-colors'
                                                : 'grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-3 rounded-xl border border-transparent px-3 py-2 transition-colors hover:border-white/[0.06] hover:bg-white/[0.02]'}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSeekToTime(cue.startTime)}
                                                className={isActive
                                                    ? 'inline-flex h-fit w-fit justify-self-start items-center rounded-lg border border-primary/25 bg-primary/18 px-2.5 py-1.5 text-left font-mono text-[11px] leading-none text-primary shadow-[0_0_14px_rgba(250,204,21,0.12)] transition-colors hover:bg-primary/24'
                                                    : 'inline-flex h-fit w-fit justify-self-start items-center rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 text-left font-mono text-[11px] leading-none text-foreground-muted transition-colors hover:border-primary/20 hover:text-primary'}
                                                title={`Seek to ${cue.startLabel}`}
                                            >
                                                <span className="whitespace-nowrap">{compactTimestamp(cue.startLabel)} <span className="opacity-45">-</span> {compactTimestamp(cue.endLabel)}</span>
                                            </button>

                                            <div className="min-w-0 py-0.5">
                                                <div className={isActive ? 'text-[13px] leading-[1.45] text-foreground font-medium' : 'text-[13px] leading-[1.45] text-foreground/86'}>
                                                    {cue.text || cue.rawLine}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <pre className="whitespace-pre-wrap break-words text-[13px] leading-[1.65] text-foreground/90 font-mono">{document?.content || 'Transcript is empty.'}</pre>
                        )}
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
                        <div className="rounded-t-[2rem] rounded-b-[1rem] border border-white/[0.08] border-b-white/[0.03] bg-background-base/95 backdrop-blur-3xl shadow-[0_25px_80px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden flex flex-col" style={{ height }}>
                            <button
                                type="button"
                                onPointerDown={onResizeStart}
                                className="group flex h-5 w-full items-center justify-center border-b border-white/[0.04] bg-white/[0.015] text-foreground-muted/70 transition-colors hover:text-primary cursor-ns-resize"
                                aria-label="Resize transcript panel"
                                title="Drag to resize transcript panel"
                            >
                                <GripHorizontal size={14} className="transition-transform group-hover:scale-110" />
                            </button>

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