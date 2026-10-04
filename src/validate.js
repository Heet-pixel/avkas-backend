const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
const PHONE = /^[+()\-\s\d]{7,18}$/;
const UUID = /^[A-Za-z0-9_-]{16,64}$/;

/** Trim, drop control characters (incl. CR/LF – blocks header injection) and cap length. */
function clean(value, max, { multiline = false } = {}) {
  if (value === undefined || value === null) return "";
  let s = String(value).normalize("NFC");
  s = multiline
    ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n")
    : s.replace(/[\u0000-\u001F\u007F]/g, " ");
  return s.trim().slice(0, max);
}

function validateContact(b) {
  const d = {
    name: clean(b.name, 120),
    email: clean(b.email, 160),
    phone: clean(b.phone, 30),
    subject: clean(b.subject, 200),
    message: clean(b.message, 5000, { multiline: true }),
  };
  if (!d.name || !d.email || !d.phone || !d.subject) return { error: "Please fill in all required fields." };
  if (!EMAIL.test(d.email)) return { error: "Please enter a valid email address." };
  if (!PHONE.test(d.phone)) return { error: "Please enter a valid phone number." };
  return { data: d };
}

function validateCareer(b) {
  const d = {
    name: clean(b.name, 120),
    email: clean(b.email, 160),
    phone: clean(b.phone, 30),
    position: clean(b.position, 120),
    experience: clean(b.experience, 80),
    message: clean(b.message, 5000, { multiline: true }),
  };
  if (!d.name || !d.email || !d.phone || !d.position) return { error: "Please fill in all required fields." };
  if (!EMAIL.test(d.email)) return { error: "Please enter a valid email address." };
  if (!PHONE.test(d.phone)) return { error: "Please enter a valid phone number." };
  return { data: d };
}

const parseSubmissionId = (v) => {
  const s = clean(v, 80);
  return UUID.test(s) ? s : null;
};

/* ---- resume checks: extension + declared MIME + real file signature ---- */
const OK_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream", // some browsers send this; the signature check below decides
]);
const SIGNATURES = {
  pdf: (b) => b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-",
  docx: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04, // ZIP container
  doc: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), // OLE2
};

function validateResume(file, maxBytes) {
  if (!file || !file.size) return { error: "Please attach your resume." };
  if (file.size > maxBytes) return { error: "Resume must be 5 MB or smaller." };
  const m = /\.(pdf|docx?)$/i.exec(file.originalname || "");
  if (!m) return { error: "Only PDF, DOC or DOCX files are allowed." };
  const ext = m[1].toLowerCase();
  if (!OK_MIME.has((file.mimetype || "").toLowerCase()) || !SIGNATURES[ext](file.buffer)) {
    return { error: "The resume file appears to be invalid. Please upload a PDF, DOC or DOCX." };
  }
  const safeName = (file.originalname || `resume.${ext}`).replace(/[^\w.\- ]+/g, "_").slice(-100);
  return { data: { filename: safeName, buffer: file.buffer, ext } };
}

module.exports = { validateContact, validateCareer, validateResume, parseSubmissionId, clean };
