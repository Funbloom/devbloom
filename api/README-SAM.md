# SAM for UI Breakdown

**Segment Anything runs in the local agent** on your machine (same pattern as Mesh Gen), not in the API process.

See **[local_agent/README-SAM.md](../local_agent/README-SAM.md)** for PyTorch, checkpoints, and `POST /ui_breakdown/sam`.

The API only performs **Gemini VLM labeling** when the web app sends `prefetched_elements` from that endpoint.
