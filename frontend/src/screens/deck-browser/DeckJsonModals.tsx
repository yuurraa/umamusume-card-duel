import { useState } from "react";
import { NeutralButton } from "../../components/buttons/NeutralButton";
import { ActionNotice } from "../../match/feedback/ActionNotice";
import {
  closeDeckModalButtonStyle,
  deckJsonActionsStyle,
  deckJsonModalStyle,
  deckJsonTextareaStyle,
  deckMetaSeparatorStyle,
  deckModalActionButtonStyle,
  deckModalBackdropStyle,
  deckModalHeaderStyle,
  deckModalInlineCountStyle,
  deckModalKickerStyle,
  deckModalMetaStyle,
  deckModalTitleStyle,
  deleteConfirmBodyStyle,
} from "./styles";

export function DeckJsonModal({
  mode,
  value,
  error,
  onClearError,
  onClose,
  onChange,
  onConfirm,
  onCopy,
  busy = false,
}: {
  mode: "export" | "import";
  value: string;
  error: string | null;
  onClearError: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCopy: () => Promise<boolean>;
  busy?: boolean;
}) {
  const isExport = mode === "export";
  const [copied, setCopied] = useState(false);
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        {error && (
          <ActionNotice
            notice={error}
            tone="danger"
            placement="bottom"
            interactive
            emphasize
            onClose={onClearError}
          />
        )}
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>{isExport ? "Export" : "Import"}</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Deck JSON</span>
            </div>
            <h2 style={deckModalTitleStyle}>{isExport ? "Copy deck JSON" : "Paste deck JSON"}</h2>
          </div>
        </header>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={isExport}
          spellCheck={false}
          style={deckJsonTextareaStyle}
          aria-label={isExport ? "Deck JSON export" : "Deck JSON import"}
        />
        <div style={deckJsonActionsStyle}>
          {isExport ? (
            <NeutralButton
              style={deckModalActionButtonStyle}
              onClick={() => {
                void onCopy().then((ok) => {
                  if (ok) setCopied(true);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </NeutralButton>
          ) : (
            <NeutralButton style={deckModalActionButtonStyle} onClick={onConfirm} disabled={busy}>{busy ? "Importing..." : "Import"}</NeutralButton>
          )}
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Close</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckDeleteConfirmModal({
  deckName,
  onClose,
  onConfirm,
  deleting = false,
}: {
  deckName: string;
  onClose: () => void;
  onConfirm: () => void;
  deleting?: boolean;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Delete</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Created Deck</span>
            </div>
            <h2 style={deckModalTitleStyle}>Delete this deck?</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>This will permanently remove <strong>{deckName}</strong>.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </NeutralButton>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Cancel</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckImportOverwriteConfirmModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Import</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Replace current cards</span>
            </div>
            <h2 style={deckModalTitleStyle}>Overwrite current deck cards?</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>Importing JSON will replace the cards currently selected in this editor.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onConfirm}>Continue Import</NeutralButton>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Cancel</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckClearAllConfirmModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={deckModalBackdropStyle} onClick={onClose}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Clear</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>Create / Edit Deck</span>
            </div>
            <h2 style={deckModalTitleStyle}>Clear all selected cards?</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>This removes all currently selected cards from this deck editor.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onConfirm}>Clear All</NeutralButton>
          <NeutralButton style={closeDeckModalButtonStyle} onClick={onClose}>Cancel</NeutralButton>
        </div>
      </section>
    </div>
  );
}

export function DeckUnsavedChangesModal({
  mode,
  onCancel,
  onSaveDraft,
  onConfirm,
}: {
  mode: "create" | "edit";
  onCancel: () => void;
  onSaveDraft: () => void;
  onConfirm: () => void;
}) {
  const title = mode === "edit"
    ? "Are you sure you want to stop editing deck?"
    : "Are you sure you want to stop creating deck?";

  return (
    <div style={deckModalBackdropStyle} onClick={onCancel}>
      <section style={deckJsonModalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={deckModalHeaderStyle}>
          <div>
            <div style={deckModalMetaStyle}>
              <span style={deckModalKickerStyle}>Unsaved Changes</span>
              <span style={deckMetaSeparatorStyle} aria-hidden="true">·</span>
              <span style={deckModalInlineCountStyle}>{mode === "edit" ? "Edit Deck" : "Create Deck"}</span>
            </div>
            <h2 style={deckModalTitleStyle}>{title}</h2>
          </div>
        </header>
        <p style={deleteConfirmBodyStyle}>Unsaved changes will be lost.</p>
        <div style={deckJsonActionsStyle}>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onCancel}>Cancel</NeutralButton>
          <NeutralButton style={deckModalActionButtonStyle} onClick={onSaveDraft}>Save as Draft</NeutralButton>
          <NeutralButton style={deckModalActionButtonStyle} tone="danger" onClick={onConfirm}>Confirm</NeutralButton>
        </div>
      </section>
    </div>
  );
}
