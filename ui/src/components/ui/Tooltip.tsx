import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
    children: React.ReactNode;
    content: React.ReactNode;
    side?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
    isOpen?: boolean;
    delay?: number;
    offset?: number;
    style?: React.CSSProperties;
}

export function Tooltip({
    children,
    content,
    side = 'top',
    className = '',
    isOpen,
    delay = 0,
    offset = 8,
    style
}: TooltipProps) {
    const [isHovered, setIsHovered] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

    const show = isOpen !== undefined ? isOpen : isHovered;

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        let x = 0;
        let y = 0;

        if (side === 'top') {
            x = rect.left + rect.width / 2;
            y = rect.top - offset;
        } else if (side === 'bottom') {
            x = rect.left + rect.width / 2;
            y = rect.bottom + offset;
        } else if (side === 'left') {
            x = rect.left - offset;
            y = rect.top + rect.height / 2;
        } else if (side === 'right') {
            x = rect.right + offset;
            y = rect.top + rect.height / 2;
        }

        setCoords({ x, y });
    }, [side, offset]);

    useLayoutEffect(() => {
        if (show) {
            updatePosition();
        }
    }, [show, updatePosition]);

    // CSS transform to center the tooltip bubble on the anchor point
    // This is applied to a STATIC outer wrapper, NOT the motion div
    const getCenteringTransform = () => {
        if (side === 'top') return 'translate(-50%, -100%)';
        if (side === 'bottom') return 'translate(-50%, 0%)';
        if (side === 'left') return 'translate(-100%, -50%)';
        if (side === 'right') return 'translate(0%, -50%)';
        return 'translate(-50%, -100%)';
    };

    // Framer Motion entrance animation (only opacity + small slide, NO x/transform)
    const getMotionProps = () => {
        const slideDistance = 4;
        if (side === 'top') return {
            initial: { opacity: 0, y: slideDistance },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: slideDistance },
        };
        if (side === 'bottom') return {
            initial: { opacity: 0, y: -slideDistance },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -slideDistance },
        };
        if (side === 'left') return {
            initial: { opacity: 0, x: slideDistance },
            animate: { opacity: 1, x: 0 },
            exit: { opacity: 0, x: slideDistance },
        };
        // right
        return {
            initial: { opacity: 0, x: -slideDistance },
            animate: { opacity: 1, x: 0 },
            exit: { opacity: 0, x: -slideDistance },
        };
    };

    const motionProps = getMotionProps();

    return (
        <div
            ref={triggerRef}
            className={`relative inline-flex items-center ${className}`}
            style={style}
            onMouseEnter={() => { setIsHovered(true); updatePosition(); }}
            onMouseLeave={() => setIsHovered(false)}
        >
            {children}
            {createPortal(
                <AnimatePresence>
                    {show && coords && (
                        /* Outer positioning wrapper — static, handles centering transform */
                        <div
                            style={{
                                position: 'fixed',
                                left: coords.x,
                                top: coords.y,
                                transform: getCenteringTransform(),
                                zIndex: 99999,
                                pointerEvents: 'none',
                            }}
                        >
                            {/* Inner animation wrapper — Framer Motion only does opacity + small slide */}
                            <motion.div
                                initial={motionProps.initial}
                                animate={motionProps.animate}
                                exit={motionProps.exit}
                                transition={{
                                    duration: 0.15,
                                    ease: 'easeOut',
                                    delay: isHovered && isOpen === undefined ? delay : 0,
                                }}
                                className="whitespace-nowrap px-3 py-1.5 rounded-[10px] text-[11px] font-bold tracking-wider text-primary bg-background-base/95 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_15px_rgba(250,204,21,0.05)] backdrop-blur-xl pointer-events-none"
                            >
                                {content}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
