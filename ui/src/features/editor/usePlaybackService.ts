import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { EditorSession, WorkbenchEntry } from '../workbench/models';


type UpdateEditorSession = (assetId: string, updater: EditorSession | ((editor: EditorSession) => EditorSession)) => void;


export function usePlaybackService(
    entry: WorkbenchEntry | undefined,
    updateEditorSession: UpdateEditorSession,
    waveformDuration: number | null,
) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const latestEntryRef = useRef<WorkbenchEntry | undefined>(entry);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);

    useEffect(() => {
        latestEntryRef.current = entry;
    }, [entry]);

    useEffect(() => {
        if (!entry?.asset.media.playbackPath) {
            return;
        }

        const audio = new Audio(convertFileSrc(entry.asset.media.playbackPath));
        audio.preload = 'metadata';
        audio.volume = volume;
        audio.playbackRate = playbackRate;
        audioRef.current = audio;

        const handleLoadedMetadata = () => {
            const nextDuration = Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : (waveformDuration ?? 0);
            setDuration(nextDuration);

            const latestEntry = latestEntryRef.current;
            if (!latestEntry || latestEntry.asset.assetId !== entry.asset.assetId) {
                return;
            }

            const trimRange = latestEntry.editorSession.trimRange ?? { start: 0, end: nextDuration };
            if (latestEntry.editorSession.segments.length === 0 && nextDuration > 0) {
                updateEditorSession(entry.asset.assetId, (editor) => ({
                    ...editor,
                    trimRange,
                    segments: [{
                        id: crypto.randomUUID(),
                        start: trimRange.start,
                        end: trimRange.end,
                        included: true,
                    }],
                }));
            } else if (!latestEntry.editorSession.trimRange && nextDuration > 0) {
                updateEditorSession(entry.asset.assetId, (editor) => ({
                    ...editor,
                    trimRange,
                }));
            }
        };

        const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);
        audio.load();

        return () => {
            audio.pause();
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
            audio.src = '';
            audioRef.current = null;
            setIsPlaying(false);
            setCurrentTime(0);
        };
    }, [entry?.asset.assetId, entry?.asset.media.playbackPath, playbackRate, updateEditorSession, volume, waveformDuration]);

    useEffect(() => {
        if (!duration && waveformDuration) {
            setDuration(waveformDuration);
        }
    }, [duration, waveformDuration]);

    const seekTo = useCallback((value: number) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.currentTime = Math.max(0, Math.min(value, duration || audio.duration || value));
        setCurrentTime(audio.currentTime);
    }, [duration]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (audio.paused) {
            void audio.play();
        } else {
            audio.pause();
        }
    }, []);

    const skipBy = useCallback((seconds: number) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.currentTime = Math.max(0, Math.min(duration || audio.duration || 0, audio.currentTime + seconds));
        setCurrentTime(audio.currentTime);
    }, [duration]);

    const setPlaybackVolume = useCallback((value: number) => {
        setVolume(value);
        if (audioRef.current) {
            audioRef.current.volume = value;
        }
    }, []);

    const setPlaybackSpeed = useCallback((value: number) => {
        setPlaybackRate(value);
        if (audioRef.current) {
            audioRef.current.playbackRate = value;
        }
    }, []);

    return {
        currentTime,
        duration,
        volume,
        playbackRate,
        isPlaying,
        seekTo,
        togglePlay,
        skipBy,
        setVolume: setPlaybackVolume,
        setPlaybackRate: setPlaybackSpeed,
    };
}