"use client";

import type { Style } from "../storyboard/types";

type Props = {
  prompt: string;
  genPrompt: string;
  onPromptChange: (value: string) => void;
  onGenPromptChange: (value: string) => void;
  styles: Style[];
  selectedStyleId: string;
  onSelectedStyleIdChange: (value: string) => void;
  sizePreset: "square" | "portrait" | "landscape";
  onSizePresetChange: (value: "square" | "portrait" | "landscape") => void;
  qualityPreset: "high" | "medium" | "low";
  onQualityPresetChange: (value: "high" | "medium" | "low") => void;
  onGeneratePrompt: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isGeneratingPrompt: boolean;
  status: string | null;
};

export function ImageTabPanel({
  prompt,
  genPrompt,
  onPromptChange,
  onGenPromptChange,
  styles,
  selectedStyleId,
  onSelectedStyleIdChange,
  sizePreset,
  onSizePresetChange,
  qualityPreset,
  onQualityPresetChange,
  onGeneratePrompt,
  onGenerate,
  isGenerating,
  isGeneratingPrompt,
  status,
}: Props) {
  return (
    <>
      <label className="imagegen-label" htmlFor="imagegen-prompt">
        Prompt (concept)
      </label>
      <textarea
        id="imagegen-prompt"
        className="imagegen-textarea"
        placeholder="Describe the image you want to generate..."
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={4}
      />

      <label className="imagegen-label" htmlFor="imagegen-gen-prompt">
        Generated Prompt
      </label>
      <textarea
        id="imagegen-gen-prompt"
        className="imagegen-textarea"
        placeholder="Generated image prompt will appear here (you can edit it)."
        value={genPrompt}
        onChange={(e) => onGenPromptChange(e.target.value)}
        rows={4}
      />

      <button
        type="button"
        className="imagegen-generate-button"
        onClick={onGeneratePrompt}
        disabled={isGeneratingPrompt || !prompt.trim()}
      >
        {isGeneratingPrompt ? "Generating Prompt..." : "Generate Prompt"}
      </button>
      <br />
      <br />

      <label className="imagegen-label" htmlFor="imagegen-style">
        Style
      </label>
      <select
        id="imagegen-style"
        className="imagegen-select"
        value={selectedStyleId}
        onChange={(e) => onSelectedStyleIdChange(e.target.value)}
      >
        <option value="__none">(No style)</option>
        {styles.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="imagegen-label" htmlFor="imagegen-size">
        Size
      </label>
      <select
        id="imagegen-size"
        className="imagegen-select"
        value={sizePreset}
        onChange={(e) => onSizePresetChange(e.target.value as "square" | "portrait" | "landscape")}
      >
        <option value="square">Square</option>
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
      </select>

      <label className="imagegen-label" htmlFor="imagegen-quality">
        Quality
      </label>
      <select
        id="imagegen-quality"
        className="imagegen-select"
        value={qualityPreset}
        onChange={(e) => onQualityPresetChange(e.target.value as "high" | "medium" | "low")}
      >
        <option value="high">High (1024)</option>
        <option value="medium">Medium (512)</option>
        <option value="low">Low (256)</option>
      </select>

      <button
        type="button"
        className="imagegen-generate-button"
        onClick={onGenerate}
        disabled={isGenerating || (!prompt.trim() && !genPrompt.trim())}
      >
        {isGenerating ? "Generating..." : "Generate"}
      </button>

      {status && (
        <div className="status" style={{ marginTop: 8 }}>
          {status}
        </div>
      )}
    </>
  );
}
