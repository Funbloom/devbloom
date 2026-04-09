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
  model: string;
  modelOptions: { value: string; label: string }[];
  onModelChange: (value: string) => void;
  openAiQuality: string;
  onOpenAiQualityChange: (value: string) => void;
  openAiStyle: string;
  onOpenAiStyleChange: (value: string) => void;
  openAiTransparent: boolean;
  onOpenAiTransparentChange: (value: boolean) => void;
  sizePreset: "square" | "portrait" | "landscape";
  onSizePresetChange: (value: "square" | "portrait" | "landscape") => void;
  qualityPreset: "high" | "medium" | "low";
  onQualityPresetChange: (value: "high" | "medium" | "low") => void;
  onGeneratePrompt: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  isGeneratingPrompt: boolean;
  status: string | null;
  onImportClick: () => void;
  isImporting: boolean;
  importDisabled: boolean;
};

export function ImageTabPanel({
  prompt,
  genPrompt,
  onPromptChange,
  onGenPromptChange,
  styles,
  selectedStyleId,
  onSelectedStyleIdChange,
  model,
  modelOptions,
  onModelChange,
  openAiQuality,
  onOpenAiQualityChange,
  openAiStyle,
  onOpenAiStyleChange,
  openAiTransparent,
  onOpenAiTransparentChange,
  sizePreset,
  onSizePresetChange,
  qualityPreset,
  onQualityPresetChange,
  onGeneratePrompt,
  onGenerate,
  isGenerating,
  isGeneratingPrompt,
  status,
  onImportClick,
  isImporting,
  importDisabled,
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

      <label className="imagegen-label" htmlFor="imagegen-model">
        Model
      </label>
      <select
        id="imagegen-model"
        className="imagegen-select"
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
      >
        {modelOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label className="imagegen-label" htmlFor="imagegen-openai-quality">
        Output Quality (GPT Image)
      </label>
      <select
        id="imagegen-openai-quality"
        className="imagegen-select"
        value={openAiQuality}
        onChange={(e) => onOpenAiQualityChange(e.target.value)}
      >
        <option value="">Default</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <label className="imagegen-label" htmlFor="imagegen-openai-style">
        Style (GPT Image)
      </label>
      <select
        id="imagegen-openai-style"
        className="imagegen-select"
        value={openAiStyle}
        onChange={(e) => onOpenAiStyleChange(e.target.value)}
      >
        <option value="">Default</option>
        <option value="natural">Natural</option>
        <option value="vivid">Vivid</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          checked={openAiTransparent}
          onChange={(e) => onOpenAiTransparentChange(e.target.checked)}
        />
        <span>Transparent background (GPT Image)</span>
      </label>

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

      <div className="imagegen-generate-import-row">
        <button
          type="button"
          className="imagegen-generate-button"
          onClick={onGenerate}
          disabled={isGenerating || isImporting || (!prompt.trim() && !genPrompt.trim())}
        >
          {isGenerating ? "Generating..." : "Generate"}
        </button>
        <button
          type="button"
          className="imagegen-import-button"
          onClick={onImportClick}
          disabled={isGenerating || isGeneratingPrompt || isImporting || importDisabled}
          title={
            importDisabled
              ? "Set an active project in Admin to import into the project Images folder"
              : "Import a file from disk (saved like a generated image)"
          }
        >
          {isImporting ? "Importing…" : "Import image…"}
        </button>
      </div>

      {status && (
        <div className="status" style={{ marginTop: 8 }}>
          {status}
        </div>
      )}
    </>
  );
}
