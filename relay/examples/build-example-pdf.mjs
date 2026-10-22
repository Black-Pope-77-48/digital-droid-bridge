import { writeFileSync } from "node:fs";

const lines = [
  "FAKE EXAMPLE. Not a Revolut export and not a real holding.",
  "Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate",
  "2000-01-01,EXAMPLE,BUY - MARKET,3,GBP 10.00,GBP 30.00,GBP,1",
];

function escapePdf(line) {
  return line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const stream = `BT /F1 10 Tf 50 760 Td 14 TL\n${lines.map((line) => `(${escapePdf(line)}) Tj T*`).join("\n")}\nET`;
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
let pdf = "%PDF-1.1\n";
const offsets = [0];
for (let i = 0; i < objects.length; i += 1) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let i = 1; i < offsets.length; i += 1) {
  pdf += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(new URL("./revolut_invest_statement.EXAMPLE.pdf", import.meta.url), pdf);
console.log(`wrote ${pdf.length} bytes`);
