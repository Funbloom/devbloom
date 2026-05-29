"use client";

import type { CategoryTreeNode } from "../audiobankUtils";

type Props = {
  nodes: CategoryTreeNode[];
  selectedCategory: string;
  totalClipCount: number;
  onSelect: (categoryPath: string) => void;
};

function TreeNode({
  node,
  selectedCategory,
  depth,
  onSelect,
}: {
  node: CategoryTreeNode;
  selectedCategory: string;
  depth: number;
  onSelect: (categoryPath: string) => void;
}) {
  const selected = selectedCategory === node.path;
  return (
    <div className="audiobank-tree-node">
      <button
        type="button"
        className={`audiobank-tree-btn${selected ? " audiobank-tree-btn--active" : ""}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => {
          onSelect(node.path);
        }}
      >
        <span className="audiobank-tree-label">{node.name}</span>
        <span className="audiobank-tree-count">{node.clipCount}</span>
      </button>
      {node.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          selectedCategory={selectedCategory}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function AudiobankCategoryTree({ nodes, selectedCategory, totalClipCount, onSelect }: Props) {
  return (
    <div className="audiobank-tree">
      <button
        type="button"
        className={`audiobank-tree-btn${selectedCategory === "" ? " audiobank-tree-btn--active" : ""}`}
        onClick={() => {
          onSelect("");
        }}
      >
        <span className="audiobank-tree-label">All</span>
        <span className="audiobank-tree-count">{totalClipCount}</span>
      </button>
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          selectedCategory={selectedCategory}
          depth={0}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
