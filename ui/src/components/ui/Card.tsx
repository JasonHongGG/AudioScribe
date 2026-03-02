import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from './Button';

interface CardProps extends HTMLMotionProps<'div'> {
    glass?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, glass = true, children, ...props }, ref) => {
        return (
            <motion.div
                ref={ref}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn(
                    'p-6 rounded-2xl flex flex-col',
                    glass ? 'glass-panel' : 'bg-panel border border-white/5',
                    className
                )}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);
Card.displayName = 'Card';
