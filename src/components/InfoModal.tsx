import React from 'react';
import { OriginalLogo } from './OriginalLogo.tsx';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <OriginalLogo size={32} />
            <h3 id="modal-title" className="modal-title">About Check Character by Chandra</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="disclaimer-box">
            <strong>Independent Project Notice:</strong>
            <p style={{ marginTop: '0.25rem' }}>
              Check Character by Chandra is an independent stockroom calculation tool. It is not affiliated with, sponsored by, or endorsed by Argos or J Sainsbury plc. All calculation rules were independently implemented from documented algorithmic specifications.
            </p>
          </div>

          <div className="modal-section">
            <h4>1. Verified Store Algorithm</h4>
            <p>
              Standard store stockroom shelving locations use a 4-character code (e.g., <code>10AK</code>: Aisle 10, Bay A, Shelf K).
            </p>
            <p>
              The check character is calculated by taking the ASCII code of each of the 4 characters, multiplying by weights <code>[5, 7, 7, 3]</code>, taking the sum modulo 26, and mapping the result to the NATO phonetic alphabet (ALPHA to ZULU).
            </p>
          </div>

          <div className="modal-section">
            <h4>2. Verified RFC Algorithm</h4>
            <p>
              Regional Fulfilment Centres (RFC) use 4-letter locations (e.g. <code>ABCD</code>, <code>AAAA</code>, <code>RETS</code>).
            </p>
            <p>
              The 2-digit check character is calculated by multiplying each letter's zero-based alphabet position (A=0..Z=25) by weights <code>[5, 7, 7, 3]</code>, adding a base offset of 45, taking the sum modulo 99, and reading the resulting two digits as spoken numbers (e.g., "SEVEN FIVE").
            </p>
          </div>

          <div className="modal-section">
            <h4>3. Reverse Lookup</h4>
            <p>
              Entering any NATO phonetic word (e.g., <code>NOVEMBER</code>) triggers an instant search through all 67,600 standard store locations (from <code>00AA</code> to <code>99ZZ</code>) to list every shelf that uses that check character, grouped by aisle.
            </p>
          </div>

          <div className="modal-section">
            <h4>4. Voice Mishearing Detection</h4>
            <p>
              Stockroom headsets can mishear letters (such as JEWELLERY heard as ZERO, or adjacent swapped digits like 10 and 01). If an alternative location produces the exact same check character, an alert is displayed to prevent lost inventory.
            </p>
          </div>

          <div className="modal-section">
            <h4>5. Privacy & Storage</h4>
            <p>
              All calculations run 100% locally in your web browser. No search queries or data are sent to any external server or database. Recent searches are saved only in your local browser storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
