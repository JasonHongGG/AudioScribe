from __future__ import annotations

from audioscribe.domain.models import WorkflowProfile
from audioscribe.stt.base import STTProvider
from audioscribe.stt.provider_registry import create_stt_provider


class TranscriptionEngineFactory:
    def create(self, profile: WorkflowProfile) -> STTProvider:
        return create_stt_provider(profile.provider_id, model_size=profile.model_id)
