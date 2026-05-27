"use client";

import type { ReactElement } from "react";

export type ImproveProposal = {
  clipId: string;
  originalText: string;
  proposedText: string;
};

type Props = {
  proposals: ImproveProposal[];
  working: boolean;
  onAccept: (clipId: string) => void;
  onReject: (clipId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
};

export function ImproveReviewPanel({
  proposals,
  working,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: Props): ReactElement {
  if (proposals.length === 0) {
    return <></>;
  }

  return (
    <section className="narrative-improve-review" aria-live="polite">
      <div className="narrative-improve-review-header">
        <h3 className="narrative-improve-review-title">Review improvements</h3>
        <span className="narrative-badge">{proposals.length}</span>
      </div>
      <div className="narrative-improve-review-body">
        <p className="narrative-hint narrative-improve-review-intro">
          Compare each line below. Accept applies it to your story files; Reject keeps the current text.
        </p>
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
                    className="narrative-improve-reject-btn"
                    disabled={working}
                    onClick={() => onReject(proposal.clipId)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="narrative-improve-bulk">
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
            className="narrative-improve-reject-btn narrative-improve-reject-all-btn"
            disabled={working}
            onClick={onRejectAll}
          >
            Reject all
          </button>
        </div>
      </div>
    </section>
  );
}
