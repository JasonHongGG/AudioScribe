import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CheckSquare, Scissors, XSquare } from 'lucide-react';
import type { ActiveTool } from '../workbench/models';
import { cn } from './utils.ts';

function ToolButton({ id, activeId, onClick, icon, label, color }: { id: ActiveTool; activeId: ActiveTool; onClick: () => void; icon: ReactNode; label: string; color?: string }) {
    const isActive = activeId === id;

    return (
        <button
            onClick={onClick}
            className={cn(
                'relative flex items-center gap-2.5 px-6 py-2.5 rounded-[1rem] text-sm font-bold transition-colors duration-300 tracking-wide z-10 group outline-none',
                isActive
                    ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                    : 'text-foreground-muted/70 hover:text-foreground hover:bg-white/[0.02]'
            )}
        >
            {isActive && (
                <motion.div
                    layoutId="activeToolBubble"
                    className="absolute inset-0 bg-white/[0.08] border border-white/20 rounded-[1rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(255,255,255,0.05)]"
                    initial={false}
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
            )}
            <span className={cn('relative z-10 transition-colors duration-300', isActive ? color : 'text-foreground-muted group-hover:text-white')}>
                {icon}
            </span>
            <span className="relative z-10">{label}</span>
        </button>
    );
}

export function ToolSelector({ activeTool, onSelect }: { activeTool: ActiveTool; onSelect: (tool: ActiveTool) => void }) {
    return (
        <div className="flex bg-surface-active/30 rounded-[1.25rem] p-1.5 border border-white/[0.04] shrink-0 ml-4 backdrop-blur-2xl shadow-[0_8px_30px_-10px_rgba(0,0,0,0.5)]">
            <ToolButton
                id="split"
                activeId={activeTool}
                onClick={() => onSelect('split')}
                icon={<Scissors size={18} />}
                label="Split"
                color="text-primary group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
            />
            <ToolButton
                id="include"
                activeId={activeTool}
                onClick={() => onSelect('include')}
                icon={<CheckSquare size={18} />}
                label="Include"
                color="text-primary group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
            />
            <ToolButton
                id="exclude"
                activeId={activeTool}
                onClick={() => onSelect('exclude')}
                icon={<XSquare size={18} />}
                label="Exclude"
                color="text-primary group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
            />
        </div>
    );
}
