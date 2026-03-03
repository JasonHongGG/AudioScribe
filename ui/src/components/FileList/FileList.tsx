import { useStore, FileTask } from '../../store';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, CircleDashed, Loader2, Trash2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// Sub-component for individual Task Card
const TaskCard = ({ task, isSelected }: { task: FileTask; isSelected: boolean }) => {
    const { selectTask, removeTask } = useStore();

    const getStatusIcon = () => {
        switch (task.status) {
            case 'ready':
                return <CircleDashed size={16} className="text-foreground-muted" />;
            case 'extracting':
            case 'transcribing':
                return <Loader2 size={16} className="text-primary animate-spin" />;
            case 'done':
                return <CheckCircle2 size={16} className="text-green-500" />;
            case 'error':
                return <AlertCircle size={16} className="text-danger" />;
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => selectTask(task.id)}
            className={cn(
                "group relative flex flex-col p-3 rounded-lg cursor-pointer transition-all border overflow-hidden",
                isSelected
                    ? "bg-surface-active border-primary/50 shadow-[0_0_15px_rgba(250,204,21,0.15)]"
                    : "bg-surface border-white/5 hover:border-white/10 hover:bg-surface-hover"
            )}
        >
            <div className="flex items-start gap-3 w-full">
                <div className="mt-0.5 shrink-0">{getStatusIcon()}</div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate w-full pr-6 text-foreground">
                        {task.name}
                    </span>
                    <span className="text-xs text-foreground-muted mt-0.5 capitalize">
                        {task.status}
                    </span>
                </div>

                {/* Remove Button (Shows on Hover) */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeTask(task.id);
                    }}
                    className="absolute right-2 top-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-danger/20 hover:text-danger text-foreground-muted transition-all"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Progress Bar Border Bottom Effect */}
            {task.progress > 0 && task.progress < 100 && (
                <div className="absolute bottom-0 left-0 h-0.5 bg-background/50 w-full">
                    <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress}%` }}
                        transition={{ ease: "easeInOut" }}
                    />
                </div>
            )}
        </motion.div>
    );
};

export function FileList() {
    const { tasks, selectedTaskId, globalProvider, setIsGlobalSettingsOpen, startBatchTranscription } = useStore();

    return (
        <div className="w-[340px] flex flex-col h-full border-r border-white/10 bg-background-dark/80 backdrop-blur-xl z-10">
            {/* Header Info Bar */}
            <div className="flex items-center justify-between px-5 h-14 border-b border-white/5 shrink-0">
                <div className="flex flex-col">
                    <span className="text-xs text-foreground-muted uppercase tracking-wider font-semibold">
                        Engine Config
                    </span>
                    <span className="text-sm text-primary font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(250,204,21,0.8)] animate-pulse" />
                        {globalProvider === 'faster-whisper' ? 'Faster Whisper' : 'Qwen3 ASR'}
                    </span>
                </div>
                <button
                    onClick={() => setIsGlobalSettingsOpen(true)}
                    className="text-xs px-3 py-1.5 rounded-full bg-surface hover:bg-surface-active text-foreground-muted hover:text-foreground transition-colors border border-white/10"
                >
                    Settings
                </button>
            </div>

            {/* List Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3 relative scroll-smooth">
                <AnimatePresence mode='popLayout'>
                    {tasks.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 flex items-center justify-center flex-col text-center p-6 text-foreground-muted"
                        >
                            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-3">
                                <CircleDashed size={20} className="opacity-50" />
                            </div>
                            <p className="text-sm font-medium">Queue is empty</p>
                            <p className="text-xs opacity-60 mt-1 max-w-[200px]">Drag & drop audio files to get started.</p>
                        </motion.div>
                    ) : (
                        tasks.map((task) => (
                            <TaskCard key={task.id} task={task} isSelected={selectedTaskId === task.id} />
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Footer / Batch Action */}
            <div className="p-4 border-t border-white/5 bg-background shrink-0">
                <button
                    onClick={startBatchTranscription}
                    disabled={tasks.length === 0}
                    className={cn(
                        "w-full py-2.5 rounded-lg flex items-center justify-center font-medium transition-all",
                        tasks.length > 0
                            ? "bg-primary text-background-dark hover:bg-primary-hover shadow-[0_0_20px_rgba(250,204,21,0.4)]"
                            : "bg-surface text-foreground-muted cursor-not-allowed"
                    )}
                >
                    Commence Batch
                </button>
            </div>
        </div>
    );
}
