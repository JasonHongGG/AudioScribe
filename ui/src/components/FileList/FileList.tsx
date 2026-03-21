import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, CircleDashed, Loader2, Trash2, AlertCircle, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getProviderDescriptor } from '../../features/settings/providerCatalog';
import { useWorkflowQueue } from '../../features/workbench/useWorkflowQueue';
import { useSettingsStore } from '../../features/workbench/settingsStore';
import { useWorkbenchStore } from '../../features/workbench/workbenchStore';
import type { WorkbenchEntry } from '../../features/workbench/models';


function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}


function getEntryPhase(entry: WorkbenchEntry): string {
    return entry.latestRun?.status ?? 'prepared';
}


function getEntryProgress(entry: WorkbenchEntry): number {
    return entry.latestRun?.progress ?? 0;
}


const EntryCard = ({ entry, isSelected }: { entry: WorkbenchEntry; isSelected: boolean }) => {
    const selectAsset = useWorkbenchStore((state) => state.selectAsset);
    const removeAsset = useWorkbenchStore((state) => state.removeAsset);
    const resetAsset = useWorkbenchStore((state) => state.resetAsset);
    const phase = getEntryPhase(entry);
    const progress = getEntryProgress(entry);

    const getStatusIcon = () => {
        switch (phase) {
            case 'prepared':
                return <CircleDashed size={14} className="text-foreground-muted/60" />;
            case 'queued':
            case 'running':
                return <Loader2 size={14} className="text-primary animate-spin" />;
            case 'completed':
                return <CheckCircle2 size={14} className="text-primary-active drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />;
            case 'failed':
            case 'cancelled':
                return <AlertCircle size={14} className="text-danger drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />;
            default:
                return <CircleDashed size={14} className="text-foreground-muted/60" />;
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => selectAsset(entry.asset.assetId)}
            className={cn(
                'group relative flex flex-col p-3.5 rounded-xl cursor-pointer transition-all duration-300 border overflow-hidden',
                isSelected
                    ? 'bg-gradient-to-br from-primary/10 to-transparent border-primary/30 shadow-[0_4px_20px_rgba(250,204,21,0.15)]'
                    : 'bg-surface border-white/[0.03] hover:border-white/10 hover:bg-surface-hover shadow-sm'
            )}
        >
            <div className="flex items-center gap-3 w-full relative z-10">
                <div className={cn('shrink-0 transition-colors duration-300', isSelected ? 'text-primary' : '')}>{getStatusIcon()}</div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className={cn(
                        'text-sm font-semibold truncate w-full pr-6 transition-colors duration-300 tracking-tight',
                        isSelected ? 'text-foreground text-glow' : 'text-foreground/80'
                    )}>
                        {entry.asset.name}
                    </span>
                    <span className="text-[10px] text-foreground-muted mt-0.5 uppercase tracking-wider font-mono opacity-80">
                        {phase}
                        {phase === 'queued' || phase === 'running' ? ` ${Math.max(0, Math.min(100, Math.floor(progress)))}%` : ''}
                    </span>
                </div>

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    {(phase === 'completed' || phase === 'failed' || phase === 'cancelled') && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                resetAsset(entry.asset.assetId);
                            }}
                            className="p-2 rounded-lg hover:bg-primary/20 hover:text-primary text-foreground-muted transition-all duration-200"
                            title="Reset Workflow"
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            removeAsset(entry.asset.assetId);
                        }}
                        className="p-2 rounded-lg hover:bg-danger/20 hover:text-danger text-foreground-muted transition-all duration-200"
                        title="Remove Asset"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {progress > 0 && progress < 100 && (
                <div className="absolute bottom-0 left-0 h-[2px] bg-background-base/50 w-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-primary-active to-primary-light shadow-[0_0_10px_rgba(250,204,21,0.5)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ ease: 'easeInOut', duration: 0.5 }}
                    />
                </div>
            )}
        </motion.div>
    );
};


export function FileList() {
    const assetOrder = useWorkbenchStore((state) => state.order);
    const assetsById = useWorkbenchStore((state) => state.assetsById);
    const editorsByAssetId = useWorkbenchStore((state) => state.editorsByAssetId);
    const draftsByAssetId = useWorkbenchStore((state) => state.draftsByAssetId);
    const runsByAssetId = useWorkbenchStore((state) => state.runsByAssetId);
    const selectedAssetId = useWorkbenchStore((state) => state.selectedAssetId);
    const globalProviderId = useSettingsStore((state) => state.globalProviderId);
    const setIsGlobalSettingsOpen = useSettingsStore((state) => state.setIsGlobalSettingsOpen);
    const startWorkflowQueue = useWorkflowQueue();
    const entries = useMemo(() => assetOrder.map((assetId) => {
        const asset = assetsById[assetId];
        const editorSession = editorsByAssetId[assetId];
        const draft = draftsByAssetId[assetId];
        if (!asset || !editorSession || !draft) {
            return null;
        }
        return {
            asset,
            editorSession,
            draft,
            latestRun: runsByAssetId[assetId] ?? null,
        } satisfies WorkbenchEntry;
    }).filter((entry): entry is WorkbenchEntry => entry !== null), [assetOrder, assetsById, editorsByAssetId, draftsByAssetId, runsByAssetId]);
    const providerDescriptor = getProviderDescriptor(globalProviderId);
    const hasReadyEntries = entries.some((entry) => entry.latestRun === null);

    return (
        <div className="w-[320px] flex flex-col h-full bg-background-light/40 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden relative shrink-0">
            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_60px_rgba(0,0,0,0.5)] z-0" />
            <div className="absolute -top-32 -left-20 w-64 h-64 bg-primary/5 blur-[60px] pointer-events-none rounded-full z-0" />

            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.05] shrink-0 relative z-10 bg-black/20 backdrop-blur-md">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-foreground-muted/60 uppercase tracking-[0.2em] font-bold">Engine Status</span>
                    <span className="text-xs text-primary font-medium flex items-center gap-2 drop-shadow-[0_0_8px_rgba(250,204,21,0.2)]">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                        {providerDescriptor.name}
                    </span>
                </div>
                <button
                    onClick={() => setIsGlobalSettingsOpen(true)}
                    className="glass-button p-2 text-foreground-muted hover:text-primary transition-colors"
                    title="Global Settings"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative scroll-smooth z-10">
                <AnimatePresence mode="popLayout">
                    {entries.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center flex-col text-center p-6 text-foreground-muted"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-black/20 flex items-center justify-center mb-5 border border-white/5 shadow-[inset_0_2px_10px_rgba(255,255,255,0.02)]">
                                <CircleDashed size={28} className="opacity-30" />
                            </div>
                            <p className="text-sm font-bold tracking-widest uppercase text-foreground-muted/80 mb-2">Queue is empty</p>
                            <p className="text-[11px] opacity-40 max-w-[180px] leading-relaxed font-mono">Drag files over the app to begin.</p>
                        </motion.div>
                    ) : (
                        entries.map((entry) => (
                            <EntryCard key={entry.asset.assetId} entry={entry} isSelected={selectedAssetId === entry.asset.assetId} />
                        ))
                    )}
                </AnimatePresence>
            </div>

            <div className="p-5 border-t border-white/[0.05] bg-black/30 backdrop-blur-md shrink-0 z-10">
                <button
                    onClick={() => { void startWorkflowQueue(); }}
                    disabled={!hasReadyEntries}
                    className={cn(
                        'w-full py-3.5 rounded-xl flex items-center justify-center font-bold tracking-[0.2em] transition-all duration-300 relative overflow-hidden group uppercase text-[11px]',
                        hasReadyEntries
                            ? 'bg-primary text-black hover:bg-primary-hover shadow-[0_0_15px_rgba(250,204,21,0.4)] hover:shadow-[0_0_25px_rgba(250,204,21,0.6)] transform hover:-translate-y-0.5'
                            : 'bg-white/5 text-foreground-muted/30 cursor-not-allowed border border-white/5'
                    )}
                >
                    {hasReadyEntries && (
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-[150%] group-hover:animate-[shimmer_1.5s_infinite]" />
                    )}
                    <span className="relative z-10 w-full text-center">Commence Batch</span>
                </button>
            </div>
        </div>
    );
}