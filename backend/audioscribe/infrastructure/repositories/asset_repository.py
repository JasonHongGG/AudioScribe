from __future__ import annotations

from audioscribe.domain.models import AssetRecord
from audioscribe.infrastructure.json_files import read_json, write_json
from audioscribe.infrastructure.workspace import WorkspacePaths


class AssetRepository:
    def __init__(self, workspace: WorkspacePaths) -> None:
        self.workspace = workspace

    def save(self, asset: AssetRecord) -> AssetRecord:
        paths = self.workspace.create_asset_paths(asset.asset_id)
        write_json(paths.asset_file, {"version": 1, "asset": asset.to_dict()})
        return asset

    def get(self, asset_id: str) -> AssetRecord:
        paths = self.workspace.asset_paths(asset_id)
        payload = read_json(paths.asset_file).get("asset") or {}
        return AssetRecord.from_dict(payload)