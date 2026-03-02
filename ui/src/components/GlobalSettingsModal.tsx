import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings2, AudioLines, Cpu } from 'lucide-react';
import { useStore } from '../store';
import clsx from 'clsx';

const TABS = [
    { id: 'stt', label: 'Transcription', icon: AudioLines },
    { id: 'general', label: 'General', icon: Settings2 },
    { id: 'advanced', label: 'Advanced', icon: Cpu },
];

const MODEL_SIZES = [
    { id: 'tiny', label: 'Tiny', desc: 'Fastest, lowest accuracy' },
    { id: 'base', label: 'Base', desc: 'Fast, decent accuracy' },
    { id: 'small', label: 'Small', desc: 'Balanced option' },
    { id: 'medium', label: 'Medium', desc: 'High accuracy, slower' },
    { id: 'large-v2', label: 'Large v2', desc: 'Excellent accuracy' },
    { id: 'large-v3', label: 'Large v3', desc: 'Max accuracy, slowest' },
];

export const GlobalSettingsModal: React.FC = () => {
    const { isGlobalSettingsOpen, closeGlobalSettings, globalProvider, globalModelSize, setGlobalProvider, setGlobalModelSize } = useStore();
    const [activeTab, setActiveTab] = useState('stt');

    if (!isGlobalSettingsOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-8 lg:p-16 bg-black/60 backdrop-blur-sm"
            >
                <motion.div
                    initial={{ scale: 0.95, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.95, y: 20, opacity: 0 }}
                    className="w-full max-w-5xl h-[85vh] bg-panel/30 backdrop-blur-3xl border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] rounded-2xl overflow-hidden flex relative"
                >
                    {/* Background Glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                    {/* Sidebar */}
                    <div className="w-64 border-r border-white/5 flex flex-col relative z-10 bg-black/20">
                        <div className="h-16 flex items-center px-6 border-b border-white/5">
                            <h2 className="text-white font-bold text-lg tracking-wide">Settings</h2>
                        </div>
                        <div className="p-4 flex-1 space-y-2">
                            {TABS.map(tab => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={clsx(
                                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative text-sm font-medium",
                                            isActive ? "text-white" : "text-white/40 hover:text-white/80 hover:bg-white/5"
                                        )}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeTabSetting"
                                                className="absolute inset-0 bg-primary/20 border border-primary/30 rounded-xl"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            />
                                        )}
                                        <Icon className="w-5 h-5 relative z-10" />
                                        <span className="relative z-10">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 flex flex-col relative z-10">
                        <div className="h-16 flex items-center justify-end px-6 border-b border-white/5">
                            <button onClick={closeGlobalSettings} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 lg:p-12">
                            <AnimatePresence mode="wait">
                                {activeTab === 'stt' && (
                                    <motion.div
                                        key="stt"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-12 max-w-3xl"
                                    >
                                        {/* Engine Selection */}
                                        <div className="space-y-4">
                                            <h3 className="text-xl font-semibold text-white">AI Engine</h3>
                                            <p className="text-sm text-white/50">Select the underlying engine used for speech-to-text processing.</p>
                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                {['faster-whisper', 'qwen3-asr'].map((provider) => {
                                                    const isActive = globalProvider === provider;
                                                    return (
                                                        <button
                                                            key={provider}
                                                            onClick={() => setGlobalProvider(provider as any)}
                                                            className={clsx(
                                                                "flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group",
                                                                isActive ? "bg-primary/20 border-primary" : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10"
                                                            )}
                                                        >
                                                            {isActive && (
                                                                <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
                                                            )}
                                                            <span className={clsx("font-semibold text-lg relative z-10", isActive ? "text-primary-foreground" : "text-white")}>
                                                                {provider === 'faster-whisper' ? 'Faster Whisper' : 'Qwen3 ASR'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Model Size Selection */}
                                        <div className="space-y-4">
                                            <h3 className="text-xl font-semibold text-white">Model Size</h3>
                                            <p className="text-sm text-white/50">Larger models provide better accuracy but require more system memory and transcribe slower.</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                                                {MODEL_SIZES.map((size) => {
                                                    const isActive = globalModelSize === size.id;
                                                    return (
                                                        <button
                                                            key={size.id}
                                                            onClick={() => setGlobalModelSize(size.id)}
                                                            className={clsx(
                                                                "flex flex-col items-start p-5 rounded-xl border transition-all duration-300 text-left relative",
                                                                isActive ? "bg-primary/20 border-primary" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                                            )}
                                                        >
                                                            {isActive && (
                                                                <motion.div
                                                                    layoutId="activeModelIndicator"
                                                                    className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary"
                                                                    initial={false}
                                                                />
                                                            )}
                                                            <span className={clsx("font-semibold mb-1", isActive ? "text-primary-foreground" : "text-white")}>{size.label}</span>
                                                            <span className="text-xs text-white/50 leading-relaxed">{size.desc}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'general' && (
                                    <motion.div
                                        key="general"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <h3 className="text-xl font-semibold text-white">General Preferences</h3>
                                        <div className="p-8 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-white/40">
                                            General settings options will appear here in the future.
                                        </div>
                                    </motion.div>
                                )}

                                {activeTab === 'advanced' && (
                                    <motion.div
                                        key="advanced"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-6"
                                    >
                                        <h3 className="text-xl font-semibold text-white">Advanced Configuration</h3>
                                        <div className="p-8 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center text-white/40">
                                            Hardware acceleration and thread controls will appear here.
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
