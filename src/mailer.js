const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");
const MailComposer = require("nodemailer/lib/mail-composer");
const cfg = require("./config");

let client;
// Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (Render environment variables).
const ses = () => (client ||= new SESv2Client({ region: cfg.aws.region }));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function body(fields) {
  const text = fields.map(([k, v]) => `${k}: ${v || "-"}`).join("\n");
  const html =
    `<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">` +
    fields
      .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#555;vertical-align:top"><b>${esc(k)}</b></td><td style="padding:6px 0">${esc(v || "-").replace(/\n/g, "<br>")}</td></tr>`)
      .join("") +
    `</table>`;
  return { text, html };
}

const utf8 = (Data) => ({ Data, Charset: "UTF-8" });

/** Contact enquiry – From is the verified SES identity, Reply-To is the visitor. */
async function sendContact(d) {
  const { text, html } = body([
    ["Name", d.name], ["Email", d.email], ["Phone", d.phone], ["Subject", d.subject], ["Message", d.message],
  ]);
  const out = await ses().send(
    new SendEmailCommand({
      FromEmailAddress: cfg.ses.from,
      Destination: { ToAddresses: cfg.ses.to },
      ReplyToAddresses: [d.email],
      Content: { Simple: { Subject: utf8("New Contact Enquiry - AVKAS & Co."), Body: { Text: utf8(text), Html: utf8(html) } } },
    })
  );
  return out.MessageId;
}

/** Career application – raw MIME so the resume can be attached. */
async function sendCareer(d, resume) {
  const { text, html } = body([
    ["Name", d.name], ["Email", d.email], ["Phone", d.phone], ["Position", d.position], ["Experience", d.experience], ["Message", d.message],
  ]);
  const mime = new MailComposer({
    from: cfg.ses.from,
    to: cfg.ses.to,
    replyTo: d.email,
    subject: `New Career Application - ${d.position}`.slice(0, 200),
    text,
    html,
    attachments: [{ filename: resume.filename, content: resume.buffer }],
  });
  const raw = await new Promise((resolve, reject) => mime.compile().build((e, m) => (e ? reject(e) : resolve(m))));
  const out = await ses().send(
    new SendEmailCommand({
      FromEmailAddress: cfg.ses.from,
      Destination: { ToAddresses: cfg.ses.to },
      Content: { Raw: { Data: raw } },
    })
  );
  return out.MessageId;
}

module.exports = { sendContact, sendCareer };
