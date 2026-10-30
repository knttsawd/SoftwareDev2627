// Builds a real one-page PDF containing line_text, so PDF tests don't need fixture files.
// A PDF lists the byte offset of every object in its "xref" table, which is why offsets
// are recorded while the file is assembled.
export function build_test_pdf(line_text) {
  const page_stream = `BT /F1 12 Tf 72 720 Td (${line_text}) Tj ET`;
  const pdf_objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${page_stream.length} >>\nstream\n${page_stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf_text = '%PDF-1.4\n';
  const object_offsets = pdf_objects.map((pdf_object, object_index) => {
    const object_offset = pdf_text.length;
    pdf_text += `${object_index + 1} 0 obj\n${pdf_object}\nendobj\n`;
    return object_offset;
  });

  const xref_offset = pdf_text.length;
  const xref_rows = object_offsets.map((object_offset) => `${String(object_offset).padStart(10, '0')} 00000 n \n`);
  pdf_text +=
    `xref\n0 ${pdf_objects.length + 1}\n0000000000 65535 f \n${xref_rows.join('')}` +
    `trailer\n<< /Size ${pdf_objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref_offset}\n%%EOF`;
  return Buffer.from(pdf_text, 'latin1');
}
