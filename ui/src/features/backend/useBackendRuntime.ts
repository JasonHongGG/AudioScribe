import { startTransition, useCallback, useEffect, useState } from 'react';
import type { BackendRuntimeInfo } from './contracts';
import { ensureBackendReady } from './runtime';

type BackendRuntimeState = 'starting' | 'ready' | 'error';

export function useBackendRuntime() {
    const [status, setStatus] = useState<BackendRuntimeState>('starting');
    const [error, setError] = useState<string | null>(null);
    const [runtime, setRuntime] = useState<BackendRuntimeInfo | null>(null);

    const boot = useCallback(async () => {
        startTransition(() => {
            setStatus('starting');
            setError(null);
        });

        try {
            const nextRuntime = await ensureBackendReady();
            startTransition(() => {
                setStatus('ready');
                setError(null);
                setRuntime(nextRuntime);
            });
        } catch (bootError) {
            startTransition(() => {
                setStatus('error');
                setError(bootError instanceof Error ? bootError.message : String(bootError));
                setRuntime(null);
            });
        }
    }, []);

    useEffect(() => {
        void boot();
    }, [boot]);

    return {
        status,
        error,
        runtime,
        retry: boot,
    };
}
