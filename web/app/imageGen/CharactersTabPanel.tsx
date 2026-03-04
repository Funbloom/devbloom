"use client";

import type { Style } from "../storyboard/types";

type Props = {
  role: string;
  physical: string;
  age: string;
  outfit: string;
  negativePrompt: string;
  styles: Style[];
  selectedStyleId: string;
  onSelectedStyleIdChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onPhysicalChange: (value: string) => void;
  onAgeChange: (value: string) => void;
  onOutfitChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onGenerateCharacter: () => void;
  isGenerating: boolean;
  status: string | null;
};

const canGenerate = (role: string, physical: string, outfit: string, age: string) =>
  role.trim() !== "" ||
  physical.trim() !== "" ||
  outfit.trim() !== "" ||
  age.trim() !== "";

export function CharactersTabPanel({
  role,
  physical,
  age,
  outfit,
  negativePrompt,
  styles,
  selectedStyleId,
  onSelectedStyleIdChange,
  onRoleChange,
  onPhysicalChange,
  onAgeChange,
  onOutfitChange,
  onNegativePromptChange,
  onGenerateCharacter,
  isGenerating,
  status,
}: Props) {
  return (
    <>
      <label className="imagegen-label" htmlFor="character-role">
        Role / Archetype
      </label>
      <input
        id="character-role"
        className="imagegen-select"
        type="text"
        placeholder="e.g. Brave space pilot, reluctant hero"
        value={role}
        onChange={(e) => onRoleChange(e.target.value)}
      />

      <label className="imagegen-label" htmlFor="character-physical">
        Physical Description
      </label>
      <textarea
        id="character-physical"
        className="imagegen-textarea"
        placeholder="Height, build, hair, face, notable features..."
        value={physical}
        onChange={(e) => onPhysicalChange(e.target.value)}
        rows={3}
      />

      <label className="imagegen-label" htmlFor="character-age">
        Age
      </label>
      <input
        id="character-age"
        className="imagegen-select"
        type="text"
        placeholder="e.g. 16-year-old, mid-30s"
        value={age}
        onChange={(e) => onAgeChange(e.target.value)}
      />

      <label className="imagegen-label" htmlFor="character-outfit">
        Outfit
      </label>
      <textarea
        id="character-outfit"
        className="imagegen-textarea"
        placeholder="Clothing, accessories, gear, colors..."
        value={outfit}
        onChange={(e) => onOutfitChange(e.target.value)}
        rows={3}
      />

      <label className="imagegen-label" htmlFor="character-negative">
        Negative Prompt
      </label>
      <textarea
        id="character-negative"
        className="imagegen-textarea"
        placeholder="Things to avoid (e.g. extra limbs, blurry, low detail)"
        value={negativePrompt}
        onChange={(e) => onNegativePromptChange(e.target.value)}
        rows={3}
      />

      <label className="imagegen-label" htmlFor="character-style">
        Style
      </label>
      <select
        id="character-style"
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

      <button
        type="button"
        className="imagegen-generate-button"
        onClick={onGenerateCharacter}
        disabled={isGenerating || !canGenerate(role, physical, outfit, age)}
      >
        {isGenerating ? "Generating Character..." : "Generate Character"}
      </button>

      {status && (
        <div className="status" style={{ marginTop: 8 }}>
          {status}
        </div>
      )}
    </>
  );
}
