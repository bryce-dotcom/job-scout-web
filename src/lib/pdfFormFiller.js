import { PDFDocument } from 'pdf-lib';

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
    const type = field.constructor.name.replace('PDF', '').replace('Field', '');
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

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (value === undefined || value === null || value === '') continue;
    try {
      const field = form.getField(fieldName);
      const type = field.constructor.name;
      if (type.includes('Text')) {
        field.setText(String(value));
      } else if (type.includes('CheckBox')) {
        const truthyValues = ['true', '1', 'yes', 'on'];
        if (truthyValues.includes(String(value).toLowerCase())) field.check();
        else field.uncheck();
      } else if (type.includes('Dropdown') || type.includes('OptionList')) {
        field.select(String(value));
      } else if (type.includes('RadioGroup')) {
        field.select(String(value));
      }
    } catch (err) {
      console.warn(`Could not fill field "${fieldName}":`, err.message);
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
