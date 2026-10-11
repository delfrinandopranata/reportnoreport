# Drop zone

Where files are added: client attachments, the CSV / zip import, the firm logo. `div.rnr-dropzone` containing an icon, a sentence, a real button and a hint.

## Anatomy
Dashed 1.5px border in `--edge` (≥ 3:1 on paper and field); drag-over turns it solid `--ink-2` (≥ 3:1 on the tint), card radius 14, `--surface` fill, centred: icon (24px `upload-simple`), "Drag files here or" + `button.rnr-btn.rnr-btn-secondary` "Choose files", then a hint line (types and size limit). The button opens a visually hidden `<input type="file">`; the whole zone also accepts a drop. Drag-hint text (`.rnr-drop-hint`) disappears on touch devices.

## States
rest · hover · focus-within (3px ring round the zone) · drag over (`data-over="true"`: solid border, `--tint`, ink text) · uploading (`aria-busy="true"`, a `rnr-progress` and "Uploading 2 of 3…") · error (`data-invalid="true"`: `--down`, icon + sentence, "Try again") · disabled (`aria-disabled="true"`, read-only roles and expired trials; say why).

## Do
State accepted types and the size cap in the hint. List accepted files below in an `rnr-table` with a remove action. Announce results with a toast or `role="status"`.

## Don't
Don't make the zone the only way in: the button is. Don't rely on the dashed border or colour to communicate drag-over: the border turns solid and the text changes.

## Accessibility
Keyboard: the button is the focus stop; Enter / Space opens the file dialog. Label the input ("Choose files to upload"). Status text in a polite live region. Target 44px.

## Copy
"Drag files here or Choose files" · "PDF, PNG or JPG, up to 10 MB each" · "Release to upload" (drag over) · "Uploading 2 of 3…" · "That file is too large. Choose one under 10 MB."
