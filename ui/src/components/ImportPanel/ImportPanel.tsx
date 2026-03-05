import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

interface ImportPanelProps {
    onImport: () => void;
}

export function ImportPanel({ onImport }: ImportPanelProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 flex items-center justify-center select-none"
        >
            <div
                onClick={onImport}
                className="relative group cursor-pointer flex flex-col items-center justify-center p-12"
            >
                {/* Ambient background glow - breathes continuously */}
                <motion.div
                    className="absolute w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Animated Orbital Rings Area */}
                <div className="relative w-40 h-40 flex items-center justify-center mb-10">
                    {/* Outer dashed ring - slow rotation */}
                    <motion.div
                        className="absolute inset-0 rounded-full border-[1.5px] border-primary/20 border-dashed opacity-50 group-hover:opacity-100 group-hover:border-primary/40 transition-colors duration-500"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    />
                    {/* Inner solid ring - reverse slow rotation */}
                    <motion.div
                        className="absolute inset-4 rounded-full border border-primary/10 opacity-50 group-hover:opacity-100 group-hover:border-primary/30 transition-colors duration-500"
                        animate={{ rotate: -360 }}
                        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                    />
                    {/* Third accent ring */}
                    <motion.div
                        className="absolute inset-8 rounded-full border border-white/5 opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
                    />

                    {/* Core Interactive Button */}
                    <motion.div
                        className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-tr from-primary/10 to-transparent border border-primary/20 flex items-center justify-center shadow-[0_0_30px_rgba(250,204,21,0.1)] overflow-hidden backdrop-blur-md transition-all duration-500 group-hover:border-primary/60 group-hover:shadow-[0_0_50px_rgba(250,204,21,0.3)] group-hover:bg-primary/10"
                        whileTap={{ scale: 0.95 }}
                    >
                        {/* Internal highlight sweep on hover */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                        {/* Plus Icon with glow */}
                        <Plus className="w-8 h-8 text-primary/80 group-hover:text-primary relative z-10 transition-colors duration-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />

                        {/* Center pulse from the icon */}
                        <motion.div
                            className="absolute inset-0 bg-primary/20 rounded-full"
                            animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        />
                    </motion.div>
                </div>

                {/* Typography Section */}
                <div className="text-center relative z-10 flex flex-col items-center">
                    <h2 className="text-4xl font-extrabold tracking-tight text-white mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] group-hover:text-glow transition-all duration-500">
                        Import Media
                    </h2>

                    <p className="text-foreground-muted font-medium text-lg mb-10 flex items-center gap-2 group-hover:text-foreground-muted/90 transition-colors">
                        Drag and drop or
                        <span className="text-primary font-semibold relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-primary/80 after:origin-bottom-right after:scale-x-0 group-hover:after:origin-bottom-left group-hover:after:scale-x-100 after:transition-transform after:duration-500 after:ease-out">
                            browse files
                        </span>
                    </p>

                    {/* Format Pills - Staggered fade in on hover */}
                    <div className="flex gap-3 justify-center">
                        {['MP3', 'WAV', 'MP4', 'MKV', 'FLAC', 'M4A'].map((ext, i) => (
                            <motion.div
                                key={ext}
                                initial={{ opacity: 0.5, y: 0 }}
                                whileHover={{ y: -3, backgroundColor: "rgba(250,204,21,0.1)", borderColor: "rgba(250,204,21,0.3)", color: "rgba(250,204,21,0.9)" }}
                                className="px-4 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.05] text-[11px] font-mono font-bold tracking-[0.2em] text-foreground-muted/50 transition-colors duration-300 backdrop-blur-sm shadow-sm cursor-default"
                            >
                                {ext}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
