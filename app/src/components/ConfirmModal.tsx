interface ConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = ({ onCancel, onConfirm }: ConfirmModalProps) => {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
      >
        <h2 id="cancel-title">Cancel generation?</h2>
        <p>
          The current work is generating. Canceling will stop this run and reset the work progress.
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Keep Running
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            Cancel Generation
          </button>
        </div>
      </section>
    </div>
  );
};
