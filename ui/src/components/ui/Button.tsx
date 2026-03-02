import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends HTMLMotionProps<'button'> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {

        const variants = {
            primary: 'bg-primary text-white hover:bg-primary-hover shadow-lg shadow-primary/20',
            secondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/5',
            danger: 'bg-danger text-white hover:bg-red-400 shadow-lg shadow-danger/20',
            ghost: 'bg-transparent text-white/70 hover:text-white hover:bg-white/10',
        };

        const sizes = {
            sm: 'px-3 py-1.5 text-sm',
            md: 'px-4 py-2',
            lg: 'px-6 py-3 text-lg font-medium',
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
                whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
                className={cn(
                    'relative flex items-center justify-center gap-2 rounded-xl transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed',
                    variants[variant],
                    sizes[size],
                    className
                )}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {!isLoading && (children as React.ReactNode)}
            </motion.button>
        );
    }
);
Button.displayName = 'Button';
