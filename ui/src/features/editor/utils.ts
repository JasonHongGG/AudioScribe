import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

export function formatTime(seconds: number, options?: { includeFractions?: boolean }) {
    const includeFractions = options?.includeFractions ?? false;
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const fraction = Math.floor((seconds % 1) * 100);

    const base = hours > 0
        ? `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    if (!includeFractions) {
        return base;
    }

    return `${base}.${fraction.toString().padStart(2, '0')}`;
}

export function pickTimelineStep(pixelsPerSecond: number) {
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    for (const step of steps) {
        if (step * pixelsPerSecond >= 56) return step;
    }
    return 3600;
}
