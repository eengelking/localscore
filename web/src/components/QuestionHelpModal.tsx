import { Modal } from "./Modal.js";

export function QuestionHelpModal({
  question,
  whyWeAsk,
  finePrint,
  onClose,
}: {
  question: string;
  whyWeAsk: string;
  finePrint?: string;
  onClose: () => void;
}) {
  return (
    <Modal titleId="question-help-title" onClose={onClose}>
      <div className="modal-header">
        <h2 id="question-help-title">{question}</h2>
      </div>
      <div className="modal-body">
        <p>{whyWeAsk}</p>
        {finePrint && (
          <div className="question-help-fine-print">
            <h3>What this maps to</h3>
            <p>{finePrint}</p>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
