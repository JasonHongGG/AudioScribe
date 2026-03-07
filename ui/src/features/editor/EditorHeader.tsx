import { motion } from 'framer-motion';
import type { ActiveTool } from '../tasks/types';
import { ToolSelector } from './ToolSelector';
import { Tooltip } from '../../components/ui/Tooltip';

interface EditorHeaderProps {
    title: string;
    activeTool: ActiveTool;
    onSelectTool: (tool: ActiveTool) => void;
}

export function EditorHeader({ title, activeTool, onSelectTool }: EditorHeaderProps) {
    return (
        <motion.div
            className="h-20 flex items-center justify-between px-8 shrink-0 z-10 w-full relative"
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        >
            <div className="flex items-center gap-5 min-w-0 group cursor-default">
                <motion.div
                    className="w-1.5 h-8 bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)]"
                    whileHover={{ scaleY: 1.2, filter: 'brightness(1.2)' }}
                />
                <Tooltip content={title} side="top" delay={0.2} className="min-w-0 overflow-hidden">
                    <h3 className="text-2xl font-black tracking-tight text-white/90 truncate group-hover:text-white transition-colors duration-300 drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
                        {title}
                    </h3>
                </Tooltip>
            </div>

            <ToolSelector activeTool={activeTool} onSelect={onSelectTool} />
        </motion.div>
    );
}