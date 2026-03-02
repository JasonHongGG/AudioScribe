import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { FileAudio, FileVideo, Settings, Trash2, CheckCircle2, Loader2, AlertCircle, Zap } from 'lucide-react';
import clsx from 'clsx';

export const FileList: React.FC = () => {
    const {
        tasks,
        selectedTaskId,
        selectTask,
        removeTask,
        openGlobalSettings,
        globalProvider,
        globalModelSize,
        isBatchTranscribing,
        startBatchTranscription
    } = useStore();

    return (
        <aside className="w-[340px] flex flex-col bg-[#11131a] border-r border-white/5 shadow-2xl relative z-10 shrink-0">
            {/* Header / Global Settings */}
            <div className="p-5 border-b border-white/5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white/80 uppercase tracking-widest">Workspace Queue</h2>
                    <button
                        onClick={openGlobalSettings}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                        title="Global Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-2 mb-1.5 relative z-10">
                        <Zap className="w-3.5 h-3.5 text-warning" />
                        <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Active Engine</span>
                    </div>
                    <div className="flex items-center justify-between relative z-10">
                        <span className="text-xs font-semibold text-white/90">{globalProvider}</span>
                        <span className="text-[10px] font-mono text-white/50 bg-black/30 px-1.5 py-0.5 rounded">{globalModelSize}</span>
                    </div>
                </div>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
                <AnimatePresence>
                    {tasks.map((task) => {
                        const isSelected = selectedTaskId === task.id;

                        return (
                            <motion.div
                                key={task.id}
                                layout
                                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                onClick={() => selectTask(task.id)}
                                className={clsx(
                                    "p-3 rounded-xl border relative overflow-hidden cursor-pointer transition-all duration-300 group flex items-center gap-3",
                                    isSelected
                                        ? "bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]"
                                        : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.07]"
                                )}
                            >
                                {/* Selection Indicator */}
                                {isSelected && (
                                    <motion.div
                                        layoutId="active-indicator"
                                        className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
                                    />
                                )}

                                {/* Progress Bar */}
                                <div
                                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary to-amber-500 transition-all duration-300 ease-out"
                                    style={{ width: `${task.progress}%` }}
                                />

                                {/* Icon based on status */}
                                <div className={clsx(
                                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border shadow-inner transition-colors",
                                    task.status === 'transcribing' ? "bg-primary/20 border-primary/40 text-primary" :
                                        task.status === 'done' ? "bg-green-500/20 border-green-500/40 text-green-400" :
                                            task.status === 'error' ? "bg-red-500/20 border-red-500/40 text-red-400" :
                                                "bg-white/5 border-white/10 text-white/60"
                                )}>
                                    {task.status === 'transcribing' ? <Loader2 className="w-5 h-5 animate-spin" /> :
                                        task.status === 'done' ? <CheckCircle2 className="w-5 h-5" /> :
                                            task.status === 'error' ? <AlertCircle className="w-5 h-5" /> :
                                                task.name.match(/\.(mp4|mkv|mov|avi)$/i) ? <FileVideo className="w-5 h-5" /> :
                                                    <FileAudio className="w-5 h-5" />}
                                </div>

                                {/* Task Info */}
                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <h4 className={clsx(
                                        "text-sm font-medium truncate transition-colors",
                                        isSelected ? "text-white" : "text-white/80 group-hover:text-white"
                                    )}>
                                        {task.name}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={clsx(
                                            "text-[10px] uppercase font-bold tracking-wider",
                                            task.status === 'transcribing' ? "text-primary flex items-center gap-1" :
                                                task.status === 'done' ? "text-green-400" :
                                                    task.status === 'error' ? "text-red-400" :
                                                        "text-white/40"
                                        )}>
                                            {task.status}
                                            {task.status === 'transcribing' && <span className="animate-pulse">...</span>}
                                        </span>
                                    </div>
                                </div>

                                {/* Remove Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeTask(task.id);
                                        if (isSelected) selectTask(null);
                                    }}
                                    className="p-1.5 rounded-md text-white/30 hover:bg-danger/20 hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                                    title="Remove from queue"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {tasks.length === 0 && (
                    <div className="h-32 flex flex-col items-center justify-center text-white/30 border-2 border-dashed border-white/5 rounded-xl mt-4">
                        <span className="text-xs font-medium uppercase tracking-widest">Queue is Empty</span>
                        <span className="text-[10px] mt-1">Drag files here to begin</span>
                    </div>
                )}
            </div>

        </div>

            {/* Bottom Action Area */ }
    {
        tasks.length > 0 && (
            <div className="p-5 border-t border-white/5 bg-[#11131a] relative z-20 shrink-0">
                <button
                    onClick={startBatchTranscription}
                    disabled={isBatchTranscribing || !tasks.some(t => t.status === 'ready' || t.status === 'error')}
                    className={clsx(
                        "w-full py-3.5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-2",
                        isBatchTranscribing || !tasks.some(t => t.status === 'ready' || t.status === 'error')
                            ? "bg-primary/10 text-primary/50 cursor-not-allowed border border-primary/20"
                            : "bg-primary text-black hover:bg-primary-hover shadow-[0_0_20px_rgba(234,179,8,0.2)] hover:shadow-[0_0_30px_rgba(234,179,8,0.4)]"
                    )}
                >
                    {isBatchTranscribing && <Loader2 className="w-5 h-5 animate-spin" />}
                    {isBatchTranscribing ? 'Processing...' : 'Commence Batch'}
                </button>
            </div>
        )
    }
        </aside >
    );
};
