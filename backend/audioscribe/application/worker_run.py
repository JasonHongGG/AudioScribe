from __future__ import annotations

import traceback
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Callable, TextIO

from audioscribe.domain.models import ArtifactRecord, EditorSelection, WorkflowSpec
from audioscribe.infrastructure.adapters.transcription_factory import TranscriptionEngineFactory
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.repositories.workflow_repository import WorkflowRepository
from audioscribe.infrastructure.runtime import bootstrap_windows_cuda_dll
from audioscribe.infrastructure.workspace import WorkspacePaths
from audioscribe.stt.base import STTProvider
from audioscribe.utils.ffmpeg import extract_audio_chunk, get_audio_duration


@dataclass(slots=True)
class ProgressReporter:
    callback: Callable[[int], None] | None = None
    _last: int = 0

    def update(self, value: int) -> None:
        if self.callback is None:
            return
        clamped = max(0, min(100, int(value)))
        if clamped <= self._last:
            return
        self._last = clamped
        self.callback(clamped)


class WorkflowRunExecutor:
    def __init__(self, workflow_repository: WorkflowRepository, engine_factory: TranscriptionEngineFactory) -> None:
        self.workflow_repository = workflow_repository
        self.engine_factory = engine_factory

    def execute(self, workflow_file: Path) -> int:
        bootstrap_windows_cuda_dll()
        workflow_spec = self.workflow_repository.load_spec_from_file(workflow_file)
        workflow_paths = self.workflow_repository.paths_for(workflow_spec.run_id)
        workflow_paths.transcript_file.parent.mkdir(parents=True, exist_ok=True)
        workflow_paths.work_dir.mkdir(parents=True, exist_ok=True)

        artifact = ArtifactRecord(
            artifact_id=f"transcript-{workflow_spec.run_id}",
            kind="transcript",
            path=str(workflow_paths.transcript_file),
        )

        try:
            provider = self.engine_factory.create(workflow_spec.draft.profile)
            reporter = ProgressReporter(
                callback=lambda progress: self.workflow_repository.update_snapshot(
                    workflow_spec.run_id,
                    status="running",
                    progress=progress,
                    artifact=artifact,
                )
            )
            self.workflow_repository.update_snapshot(
                workflow_spec.run_id,
                status="running",
                progress=1,
                artifact=artifact,
            )
            self._transcribe_workflow_run(workflow_spec, provider, reporter, workflow_paths.transcript_file, workflow_paths.work_dir)
            self.workflow_repository.update_snapshot(
                workflow_spec.run_id,
                status="completed",
                progress=100,
                artifact=artifact,
            )
            return 0
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self.workflow_repository.update_snapshot(
                workflow_spec.run_id,
                status="failed",
                progress=0,
                error_message=f"{type(exc).__name__}: {exc}",
                artifact=artifact,
            )
            return 1

    def _transcribe_workflow_run(
        self,
        workflow_spec: WorkflowSpec,
        provider: STTProvider,
        reporter: ProgressReporter,
        output_path: Path,
        work_dir: Path,
    ) -> None:
        audio_path = Path(workflow_spec.asset.prepared_media.playback_path or workflow_spec.asset.source.path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        total_duration = self._safe_duration(audio_path)
        reporter.update(5)

        processing_audio = audio_path
        base_offset = 0.0
        trim_tmp_path: Path | None = None
        chunks = self._resolve_chunks(workflow_spec.draft.selection, total_duration)

        trim_start = workflow_spec.draft.selection.trim_start if workflow_spec.draft.selection.trim_start is not None else 0.0
        trim_end = workflow_spec.draft.selection.trim_end if workflow_spec.draft.selection.trim_end is not None else total_duration
        if total_duration > 0 and (trim_start > 0.0 or trim_end < total_duration):
            trim_tmp_path = work_dir / "trimmed.flac"
            log_bus.write(f"    Applying trim range: {trim_start:.2f}s -> {trim_end:.2f}s")
            extract_audio_chunk(audio_path, trim_tmp_path, trim_start, trim_end)
            processing_audio = trim_tmp_path
            base_offset = trim_start
            chunks = [(max(0.0, start - trim_start), max(0.0, end - trim_start)) for start, end in chunks]

        reporter.update(15)
        try:
            with output_path.open("w", encoding="utf-8") as target:
                if chunks:
                    self._transcribe_chunked(processing_audio, chunks, base_offset, provider, reporter, target, work_dir)
                else:
                    self._transcribe_single(processing_audio, base_offset, total_duration, provider, reporter, target)
        finally:
            if trim_tmp_path is not None and trim_tmp_path.exists():
                trim_tmp_path.unlink()

    def _transcribe_single(
        self,
        audio_path: Path,
        offset: float,
        total_duration: float,
        provider: STTProvider,
        reporter: ProgressReporter,
        target: TextIO,
    ) -> None:
        reporter.update(25)
        duration_hint = total_duration - offset if offset > 0 and total_duration > 0 else total_duration
        self._transcribe_chunk(audio_path, target, offset, 25, 90, duration_hint, provider, reporter)
        reporter.update(90)

    def _transcribe_chunked(
        self,
        source_audio: Path,
        chunks: list[tuple[float, float]],
        base_offset: float,
        provider: STTProvider,
        reporter: ProgressReporter,
        target: TextIO,
        work_dir: Path,
    ) -> None:
        chunk_count = len(chunks)
        log_bus.write(f"    Processing {chunk_count} included ranges...")
        for index, (start, end) in enumerate(chunks):
            progress_start = 20 + int((index / max(1, chunk_count)) * 70)
            progress_end = 20 + int(((index + 1) / max(1, chunk_count)) * 70)
            reporter.update(progress_start)
            chunk_path = work_dir / f"chunk_{index:04d}.flac"
            extract_audio_chunk(source_audio, chunk_path, start, end)
            try:
                self._transcribe_chunk(
                    chunk_path,
                    target,
                    base_offset + start,
                    progress_start,
                    progress_end,
                    max(0.0, end - start),
                    provider,
                    reporter,
                )
            finally:
                if chunk_path.exists():
                    chunk_path.unlink()
            reporter.update(progress_end)

    def _transcribe_chunk(
        self,
        audio_path: Path,
        target: TextIO,
        offset: float,
        progress_start: int,
        progress_end: int,
        duration_hint: float,
        provider: STTProvider,
        reporter: ProgressReporter,
    ) -> None:
        result = provider.transcribe(audio_path)
        if result.language:
            if result.language_probability is not None:
                log_bus.write(f"    Detected language: {result.language} ({result.language_probability:.2f})")
            else:
                log_bus.write(f"    Detected language: {result.language}")

        if result.has_timestamps:
            for segment in result.segments:
                actual_start = segment.start + offset
                actual_end = segment.end + offset
                line = f"[{timedelta(seconds=actual_start)} -> {timedelta(seconds=actual_end)}] {segment.text}"
                target.write(line + "\n")
                log_bus.write(f"    {line}")
                if duration_hint > 0 and progress_end > progress_start:
                    ratio = max(0.0, min(1.0, segment.end / duration_hint))
                    reporter.update(progress_start + int((progress_end - progress_start) * ratio))
            return

        text = " ".join(segment.text.strip() for segment in result.segments if segment.text.strip()).strip()
        target.write((text or "[No transcript text produced]") + "\n")
        reporter.update(progress_end)

    @staticmethod
    def _safe_duration(audio_path: Path) -> float:
        try:
            return get_audio_duration(audio_path)
        except Exception:
            return 0.0

    @staticmethod
    def _resolve_chunks(selection: EditorSelection, total_duration: float) -> list[tuple[float, float]]:
        trim_start = max(0.0, min(selection.trim_start if selection.trim_start is not None else 0.0, total_duration))
        trim_end = max(trim_start, min(selection.trim_end if selection.trim_end is not None else total_duration, total_duration))
        if trim_end <= trim_start:
            trim_start = 0.0
            trim_end = total_duration

        included_segments = [segment for segment in selection.segments if segment.included]
        if not included_segments:
            return []

        chunks: list[tuple[float, float]] = []
        for segment in included_segments:
            start = max(trim_start, min(segment.start, trim_end))
            end = max(trim_start, min(segment.end, trim_end))
            if end > start:
                chunks.append((start, end))

        if not chunks and total_duration > 0:
            return [(trim_start, trim_end)]
        return chunks


def execute_run_file(workflow_file: Path, workspace: WorkspacePaths) -> int:
    repository = WorkflowRepository(workspace)
    executor = WorkflowRunExecutor(repository, TranscriptionEngineFactory())
    return executor.execute(workflow_file)