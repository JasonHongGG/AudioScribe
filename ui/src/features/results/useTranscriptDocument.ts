import { useEffect, useMemo, useState } from 'react';
import { loadTranscriptDocument, parseTranscriptCues, type TranscriptCue, type TranscriptDocument } from './transcript';


interface UseTranscriptDocumentOptions {
    isOpen: boolean;
    canLoad: boolean;
    runId: string | null;
}


interface TranscriptDocumentState {
    document: TranscriptDocument | null;
    cues: TranscriptCue[];
    isLoading: boolean;
    error: string | null;
}


export function useTranscriptDocument({ isOpen, canLoad, runId }: UseTranscriptDocumentOptions): TranscriptDocumentState {
    const [document, setDocument] = useState<TranscriptDocument | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let intervalId: number | undefined;

        async function readTranscript(showLoader: boolean) {
            if (!isOpen || !canLoad || !runId) {
                setDocument(null);
                setError(null);
                setIsLoading(false);
                return;
            }

            if (showLoader) {
                setIsLoading(true);
            }
            setError(null);

            try {
                const nextDocument = await loadTranscriptDocument(runId);
                if (!cancelled) {
                    setDocument((current) => {
                        if (current?.path === nextDocument.path && current.content === nextDocument.content) {
                            return current;
                        }
                        return nextDocument;
                    });
                }
            } catch (loadError) {
                if (!cancelled) {
                    setDocument(null);
                    setError(loadError instanceof Error ? loadError.message : String(loadError));
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        void readTranscript(true);

        if (isOpen && canLoad && runId) {
            intervalId = window.setInterval(() => {
                void readTranscript(false);
            }, 1500);
        }

        return () => {
            cancelled = true;
            if (intervalId !== undefined) {
                window.clearInterval(intervalId);
            }
        };
    }, [isOpen, canLoad, runId]);

    const cues = useMemo(() => parseTranscriptCues(document?.content ?? ''), [document?.content]);

    return {
        document,
        cues,
        isLoading,
        error,
    };
}