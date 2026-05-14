from pydantic import BaseModel, Field


class SolitaireCardsFolderRequest(BaseModel):
    project_key: str = Field(min_length=1)
    folder_relative: str = Field(
        min_length=1,
        description="Folder under project root, e.g. Assets/StreamingAssets/Solitaire/Cards",
    )
    filenames: list[str] | None = Field(
        default=None,
        description="If set, only process these basenames in the folder (case-insensitive). Omit to process every image.",
    )
