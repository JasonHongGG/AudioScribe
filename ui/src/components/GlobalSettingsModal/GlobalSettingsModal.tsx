import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, X, Cpu, Globe, Check } from 'lucide-react';
import { useStore } from '../../store';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

const MODELS = [
    { id: 'tiny', name: 'Tiny', desc: 'Fastest, lowest accuracy (approx. 39M params)' },
    { id: 'base', name: 'Base', desc: 'Good balance for casual use (approx. 74M params)' },
    { id: 'small', name: 'Small', desc: 'Better accuracy, moderate speed (approx. 244M params)' },
    { id: 'medium', name: 'Medium', desc: 'High accuracy, slower (approx. 769M params)' },
    { id: 'large-v2', name: 'Large V2', desc: 'Very high accuracy, requires good GPU (approx. 1550M params)' },
    { id: 'large-v3', name: 'Large V3', desc: 'State of the art, maximum accuracy' },
];

export function GlobalSettingsModal() {
    const {
        isGlobalSettingsOpen,
        setIsGlobalSettingsOpen,
        globalProvider,
        setGlobalProvider,
        globalModelSize,
        setGlobalModelSize
    } = useStore();

    const [activeTab, setActiveTab] = useState<'transcription' | 'general'>('transcription');

    return (
        <AnimatePresence>
            {isGlobalSettingsOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsGlobalSettingsOpen(false)}
                        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="w-full max-w-3xl h-[600px] flex overflow-hidden rounded-2xl border border-white/10 glass-panel shadow-2xl pointer-events-auto"
                        >
                            {/* Sidebar Tabs */}
                            <div className="w-48 bg-background-dark border-r border-white/5 p-4 flex flex-col gap-2">
                                <div className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-4 px-3">
                                    Settings
                                </div>
                                <button
                                    onClick={() => setActiveTab('transcription')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                                        activeTab === 'transcription'
                                            ? "bg-primary/10 text-primary"
                                            : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                                    )}
                                >
                                    <Cpu size={16} className={activeTab === 'transcription' ? "text-primary" : "group-hover:text-foreground transition-colors"} />
                                    Transcription
                                </button>
                                <button
                                    onClick={() => setActiveTab('general')}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                                        activeTab === 'general'
                                            ? "bg-primary/10 text-primary"
                                            : "text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                                    )}
                                >
                                    <Globe size={16} className={activeTab === 'general' ? "text-primary" : "group-hover:text-foreground transition-colors"} />
                                    General
                                </button>
                            </div>

                            {/* Main Content Area */}
                            <div className="flex-1 flex flex-col bg-background relative">
                                {/* Header */}
                                <div className="h-16 flex items-center justify-between px-8 border-b border-white/5 shrink-0">
                                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <Settings2 size={20} className="text-primary" />
                                        {activeTab === 'transcription' ? 'AI Transcription Engine' : 'General Preferences'}
                                    </h2>
                                    <button
                                        onClick={() => setIsGlobalSettingsOpen(false)}
                                        className="p-2 -mr-2 text-foreground-muted hover:text-white hover:bg-danger rounded-lg transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Content Body */}
                                <div className="flex-1 overflow-y-auto p-8">
                                    {activeTab === 'transcription' && (
                                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                                            {/* Provider Selection */}
                                            <section>
                                                <h3 className="text-sm font-medium text-foreground-muted mb-4 uppercase tracking-wider">Engine Provider</h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {[
                                                        { id: 'faster-whisper', name: 'Faster Whisper', default: true },
                                                        { id: 'qwen3-asr', name: 'Qwen3 ASR (Advanced)', default: false }
                                                    ].map((provider) => (
                                                        <button
                                                            key={provider.id}
                                                            onClick={() => setGlobalProvider(provider.id as any)}
                                                            className={cn(
                                                                "relative flex flex-col items-start p-4 rounded-xl border transition-all text-left",
                                                                globalProvider === provider.id
                                                                    ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(250,204,21,0.1)]"
                                                                    : "bg-surface border-white/5 hover:border-white/20 hover:bg-surface-hover"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between w-full mb-1">
                                                                <span className={cn("font-semibold", globalProvider === provider.id ? "text-primary" : "text-foreground")}>
                                                                    {provider.name}
                                                                </span>
                                                                {globalProvider === provider.id && <Check size={16} className="text-primary" />}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>

                                            {/* Model Size Selection */}
                                            <section>
                                                <h3 className="text-sm font-medium text-foreground-muted mb-4 uppercase tracking-wider">Model Size</h3>
                                                <div className="grid gap-3">
                                                    {MODELS.map((model) => (
                                                        <button
                                                            key={model.id}
                                                            onClick={() => setGlobalModelSize(model.id)}
                                                            className={cn(
                                                                "relative flex items-center p-4 rounded-xl border transition-all text-left group",
                                                                globalModelSize === model.id
                                                                    ? "bg-surface-active border-primary/50 shadow-inner"
                                                                    : "bg-surface border-white/5 hover:border-white/10 hover:bg-surface-hover"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "w-4 h-4 rounded-full border-2 mr-4 flex items-center justify-center transition-colors shrink-0",
                                                                globalModelSize === model.id ? "border-primary" : "border-foreground-muted group-hover:border-foreground"
                                                            )}>
                                                                {globalModelSize === model.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className={cn("font-semibold text-sm", globalModelSize === model.id ? "text-foreground" : "text-foreground/80 group-hover:text-foreground")}>
                                                                    {model.name}
                                                                </span>
                                                                <span className="text-xs text-foreground-muted mt-0.5">{model.desc}</span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>

                                        </div>
                                    )}

                                    {activeTab === 'general' && (
                                        <div className="text-center text-foreground-muted py-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            <Globe size={48} className="mx-auto mb-4 opacity-20" />
                                            <p>General settings module coming soon.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
