import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFButton } from 'pdf-lib';

// What kind of field this is. NOT field.constructor.name: the production
// build minifies pdf-lib's class names, so "PDFTextField" arrives as "t" and
// a name check matches nothing — every utility form generated in production
// came back blank while the dev server filled it (found 2026-09-25 on the
// demo's Xcel application). instanceof survives minification.
export function fieldKind(field) {
  if (field instanceof PDFTextField) return 'Text'
  if (field instanceof PDFCheckBox) return 'CheckBox'
  if (field instanceof PDFDropdown) return 'Dropdown'
  if (field instanceof PDFOptionList) return 'OptionList'
  if (field instanceof PDFRadioGroup) return 'RadioGroup'
  if (field instanceof PDFSignature) return 'Signature'
  if (field instanceof PDFButton) return 'Button'
  return 'Unknown'
}

const TRUTHY = ['true', '1', 'yes', 'on', 'x', 'checked']

/** Set one field from a string value, by kind. Throws on a pdf-lib refusal. */
export function setFieldValue(field, value) {
  const kind = fieldKind(field)
  const text = String(value)
  if (kind === 'Text') field.setText(text)
  else if (kind === 'CheckBox') { if (TRUTHY.includes(text.toLowerCase())) field.check(); else field.uncheck() }
  else if (kind === 'Dropdown' || kind === 'OptionList' || kind === 'RadioGroup') field.select(text)
  return kind
}

function fillFields(form, fieldValues) {
  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (value === undefined || value === null || value === '') continue;
    try {
      setFieldValue(form.getField(fieldName), value)
    } catch (err) {
      console.warn(`Could not fill field "${fieldName}":`, err.message);
    }
  }
}

/**
 * Extract all fillable form fields from a PDF.
 * @param {Uint8Array|ArrayBuffer} pdfBytes - raw PDF data
 * @returns {Promise<Array<{name: string, type: string, value: string}>>}
 */
export async function extractFormFields(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields.map((field) => {
    const type = fieldKind(field);
    let value = '';
    try {
      if (typeof field.getText === 'function') value = field.getText() || '';
      else if (typeof field.isChecked === 'function') value = field.isChecked() ? 'true' : 'false';
      else if (typeof field.getSelected === 'function') {
        const sel = field.getSelected();
        value = Array.isArray(sel) ? sel.join(', ') : sel || '';
      }
    } catch { /* field may not have a value */ }

    return { name: field.getName(), type, value };
  });
}

/**
 * Fill a PDF form with the given field values.
 * @param {Uint8Array|ArrayBuffer} pdfBytes - raw PDF data
 * @param {Record<string, string>} fieldValues - { pdfFieldName: value }
 * @returns {Promise<Uint8Array>} - filled PDF bytes
 */
export async function fillPdfForm(pdfBytes, fieldValues) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  fillFields(form, fieldValues)

  return await pdfDoc.save();
}

/**
 * Fill a PDF form with values AND embed image overlays (e.g. signatures).
 * @param {Uint8Array|ArrayBuffer} pdfBytes - raw PDF data
 * @param {Record<string, string>} fieldValues - { pdfFieldName: value }
 * @param {Array<{imageBytes: Uint8Array, page?: number, x: number, y: number, width: number, height: number}>} imageOverlays
 * @returns {Promise<Uint8Array>} - filled PDF bytes
 */
export async function fillPdfFormWithImages(pdfBytes, fieldValues, imageOverlays) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  // Fill text fields (same as fillPdfForm)
  fillFields(form, fieldValues)

  // Embed image overlays
  for (const overlay of imageOverlays) {
    try {
      const img = await pdfDoc.embedPng(overlay.imageBytes);
      const page = pdfDoc.getPage(overlay.page || 0);
      page.drawImage(img, {
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
      });
    } catch (err) {
      console.warn('Could not embed image overlay:', err.message);
    }
  }

  return await pdfDoc.save();
}

/**
 * Trigger a browser download of the given PDF bytes.
 * @param {Uint8Array} bytes
 * @param {string} filename
 */
export function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
