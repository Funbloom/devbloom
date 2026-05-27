"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactElement } from "react";

import type { ImproveProposal } from "./ImproveReviewPanel";

type Props = {
  open: boolean;
  proposals: ImproveProposal[];
  working: boolean;
  onAccept: (clipId: string) => void;
  onDecline: (clipId: string) => void;
  onAcceptAll: () => void;
  onDeclineAll: () => void;
};

export function ImproveReviewModal({
  open,
  proposals,
  working,
  onAccept,
  onDecline,
  onAcceptAll,
  onDeclineAll,
}: Props): ReactElement | null {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open || proposals.length === 0) {
    return null;
  }

  return createPortal(
    <div
      className="narrative-modal-backdrop"
      aria-modal="true"
      role="dialog"
      aria-labelledby="narrative-improve-modal-title"
    >
      <div className="narrative-modal">
        <header className="narrative-improve-review-header">
          <h2 id="narrative-improve-modal-title" className="narrative-improve-review-title">
            Review AI changes
          </h2>
          <span className="narrative-badge">{proposals.length}</span>
        </header>
        <p className="narrative-hint narrative-improve-review-intro">
          Compare current and proposed dialogue. Accept updates your story files; Decline keeps the original text.
        </p>
        <div className="narrative-improve-review-body">
          <ul className="narrative-improve-list">
            {proposals.map((proposal) => {
              const unchanged = proposal.originalText.trim() === proposal.proposedText.trim();
              return (
                <li key={proposal.clipId} className="narrative-improve-item">
                  <p className="narrative-improve-clip-id" title={proposal.clipId}>
                    {proposal.clipId}
                  </p>
                  <div className="narrative-improve-compare">
                    <div className="narrative-improve-col narrative-improve-col--current">
                      <span className="narrative-improve-col-label">Current</span>
                      <p className="narrative-improve-text">{proposal.originalText || "(empty)"}</p>
                    </div>
                    <div className="narrative-improve-col narrative-improve-col--proposed">
                      <span className="narrative-improve-col-label">Proposed</span>
                      <p className="narrative-improve-text">{proposal.proposedText || "(empty)"}</p>
                    </div>
                  </div>
                  {unchanged ? (
                    <p className="narrative-improve-unchanged">No wording change from AI.</p>
                  ) : null}
                  <div className="narrative-improve-item-actions">
                    <button
                      type="button"
                      className="imagegen-generate-button narrative-improve-accept-btn"
                      disabled={working}
                      onClick={() => onAccept(proposal.clipId)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="narrative-improve-decline-btn"
                      disabled={working}
                      onClick={() => onDecline(proposal.clipId)}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <footer className="narrative-improve-bulk">
          <button
            type="button"
            className="imagegen-generate-button narrative-improve-accept-all-btn"
            disabled={working}
            onClick={onAcceptAll}
          >
            Accept all
          </button>
          <button
            type="button"
            className="narrative-improve-decline-btn narrative-improve-decline-all-btn"
            disabled={working}
            onClick={onDeclineAll}
          >
            Decline all
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
