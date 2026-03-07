import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Pause, Play, Volume2 } from 'lucide-react';
import { Tooltip } from '../../components/ui/Tooltip';
import { formatTime } from './utils.ts';

interface PlayerDockProps {
    currentTime: number;
    duration: number;
    volume: number;
    isPlaying: boolean;
    onSeek: (value: number) => void;
    onTogglePlay: () => void;
    onSkip: (seconds: number) => void;
    onVolumeChange: (value: number) => void;
    transcriptState: 'idle' | 'ready' | 'failed';
    isTranscriptPanelOpen: boolean;
    onToggleTranscriptPanel: () => void;
}

export function PlayerDock({
    currentTime,
    duration,
    volume,
    isPlaying,
    onSeek,
    onTogglePlay,
    onSkip,
    onVolumeChange,
    transcriptState,
    isTranscriptPanelOpen,
    onToggleTranscriptPanel,
}: PlayerDockProps) {
    const [isVolumeHovered, setIsVolumeHovered] = useState(false);
    const transcriptLabel = transcriptState === 'ready'
        ? 'Transcript ready'
        : transcriptState === 'failed'
            ? 'Transcript failed'
            : 'Transcript';

    return (
        <motion.div
            className="absolute bottom-6 left-1/2 w-[95%] max-w-[1000px] bg-background-base/90 backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)] flex flex-col z-50 overflow-hidden px-10 py-5 gap-3"
            initial={{ y: 80, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, delay: 0.2 }}
            whileHover={{ y: -2, transition: { duration: 0.3, ease: 'easeOut' }, boxShadow: '0 30px 60px -20px rgba(0,0,0,1), 0 0 40px rgba(250,204,21,0.06), inset 0 1px 0 rgba(255,255,255,0.15)' }}
        >
            <div className="flex items-center gap-4 w-full">
                <span className="text-[13px] font-mono font-bold tracking-wider text-primary text-glow drop-shadow-[0_0_8px_rgba(250,204,21,0.5)] w-16 text-right shrink-0">
                    {formatTime(currentTime)}
                </span>

                <div className="group/slider relative h-5 flex items-center flex-1 cursor-pointer">
                    <input
                        type="range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        step={0.01}
                        onChange={(e) => onSeek(parseFloat(e.target.value))}
                        className="w-full h-full rounded-full appearance-none bg-transparent cursor-pointer outline-none absolute inset-0 z-10 opacity-0"
                    />
                    <div className="absolute left-0 right-0 h-1.5 bg-surface-active rounded-full overflow-hidden pointer-events-none transition-all duration-300 group-hover/slider:h-2.5">
                        <div
                            className="h-full bg-primary rounded-full relative shadow-[0_0_15px_rgba(250,204,21,0.6)]"
                            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                        >
                            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/40" />
                        </div>
                    </div>
                    <motion.div
                        className="absolute h-3.5 w-3.5 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5),0_0_15px_rgba(250,204,21,0.8)] pointer-events-none"
                        style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 7px)` }}
                        initial={false}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.4 }}
                    />
                </div>

                <span className="text-[13px] font-mono font-medium tracking-wider text-foreground-muted w-16 text-left shrink-0">
                    {formatTime(duration)}
                </span>
            </div>

            <div className="flex items-center justify-between w-full mt-1">
                <div className="w-[180px] flex items-center">
                    <Tooltip content={transcriptLabel} side="top" delay={0.15}>
                        <button
                            onClick={onToggleTranscriptPanel}
                            className={isTranscriptPanelOpen
                                ? 'glass-button h-10 w-10 flex items-center justify-center text-primary border-primary/20 shadow-[0_0_18px_rgba(250,204,21,0.12)] transition-colors'
                                : 'glass-button h-10 w-10 flex items-center justify-center text-foreground-muted hover:text-foreground transition-colors'}
                            aria-label={transcriptLabel}
                            aria-pressed={isTranscriptPanelOpen}
                            title={transcriptLabel}
                        >
                            <span className="relative flex items-center justify-center">
                            <FileText size={14} className={transcriptState === 'ready' ? 'text-primary' : transcriptState === 'failed' ? 'text-danger' : ''} />
                            {transcriptState !== 'idle' && (
                                <span className={
                                    transcriptState === 'ready'
                                        ? 'absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                                        : 'absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-danger shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                                } />
                            )}
                            </span>
                        </button>
                    </Tooltip>
                </div>

                <div className="flex items-center justify-center gap-4 flex-1 relative z-10">
                    <motion.button
                        onClick={() => onSkip(-5)}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <ChevronsLeft size={28} />
                    </motion.button>

                    <motion.button
                        onClick={() => onSkip(-1)}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <ChevronLeft size={28} />
                    </motion.button>

                    <motion.button
                        onClick={onTogglePlay}
                        className="w-14 h-14 flex items-center justify-center rounded-full bg-primary text-black shadow-[0_5px_20px_rgba(250,204,21,0.4)] mx-2"
                        whileHover={{ scale: 1.05, boxShadow: '0 8px 30px rgba(250,204,21,0.6)' }}
                        whileTap={{ scale: 0.95, boxShadow: '0 2px 10px rgba(250,204,21,0.3)' }}
                    >
                        {isPlaying ? <Pause size={26} className="fill-current" /> : <Play size={26} className="fill-current translate-x-0.5" />}
                    </motion.button>

                    <motion.button
                        onClick={() => onSkip(1)}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <ChevronRight size={28} />
                    </motion.button>

                    <motion.button
                        onClick={() => onSkip(5)}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <ChevronsRight size={28} />
                    </motion.button>
                </div>

                <div className="w-[180px] flex items-center gap-4 justify-end">
                    <div
                        className="group/vol relative h-5 flex items-center w-28 cursor-pointer"
                        onMouseEnter={() => setIsVolumeHovered(true)}
                        onMouseLeave={() => setIsVolumeHovered(false)}
                    >
                        <input
                            type="range"
                            min={0}
                            max={1}
                            value={volume}
                            step={0.01}
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                            className="w-full h-full rounded-full appearance-none bg-transparent cursor-pointer outline-none absolute inset-0 z-10 opacity-0"
                        />
                        <div className="absolute left-0 right-0 h-1.5 bg-surface-active rounded-full overflow-hidden pointer-events-none transition-all duration-300 group-hover/vol:h-2">
                            <div
                                className="h-full bg-white/80 rounded-full"
                                style={{ width: `${volume * 100}%` }}
                            />
                        </div>
                        <Tooltip
                            content={`${Math.round(volume * 100)}%`}
                            side="top"
                            className="absolute h-3 w-3 pointer-events-none"
                            style={{ left: `calc(${volume * 100}% - 6px)` }}
                            offset={12}
                            isOpen={isVolumeHovered}
                        >
                            <div className="w-full h-full bg-white rounded-full shadow-md" />
                        </Tooltip>
                    </div>
                    <div className="text-foreground-muted/80 shrink-0 w-5 flex justify-center">
                        <Volume2 size={18} className="text-white/80" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
