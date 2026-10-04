/**
 * Smoke test for a running API.   node scripts/test-api.js https://avkas-api.onrender.com
 * Needs Node 18+. NOTE: it sends 2 REAL test emails (1 contact + 1 career) to SES_TO_EMAIL.
 * Pass the allowed browser origin as 2nd argument if you test through a temporary address:
 *   node scripts/test-api.js https://avkas-api.onrender.com https://avkas-site.onrender.com
 */
const base = (process.argv[2] || "http://localhost:4000").replace(/\/+$/, "");
const origin = process.argv[3] || "https://avkasco.com";
const uuid = () => require("crypto").randomUUID();
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) failed++; };
const json = async (res) => { try { return await res.json(); } catch { return null; } };

(async () => {
  console.log(`Testing ${base} (Origin: ${origin})\n`);
  const t0 = Date.now();

  let r = await fetch(`${base}/api/wake`, { headers: { Origin: origin } });
  check("GET /api/wake -> awake", r.ok && (await json(r))?.status === "awake", `(${Date.now() - t0} ms – large if it was sleeping)`);
  r = await fetch(`${base}/api/health`);
  check("GET /api/health -> ok", r.ok && (await json(r))?.status === "ok");

  r = await fetch(`${base}/api/wake`, { headers: { Origin: origin } });
  check("CORS header is the exact origin (not *)", r.headers.get("access-control-allow-origin") === origin);
  r = await fetch(`${base}/api/wake`, { headers: { Origin: "https://evil.example" } });
  check("CORS: foreign origin gets no allow header", !r.headers.get("access-control-allow-origin"));

  const contact = (id, over = {}) => {
    const f = new FormData();
    f.set("submissionId", id);
    f.set("name", "API Test"); f.set("email", "test@example.com"); f.set("phone", "+91 90000 00000");
    f.set("subject", "TEST – API smoke test"); f.set("message", "Please ignore – automated test.");
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return fetch(`${base}/api/contact`, { method: "POST", body: f, headers: { Origin: origin } });
  };

  r = await contact(uuid(), { name: "" });
  check("contact: missing field -> 400", r.status === 400);
  r = await contact(uuid(), { email: "not-an-email" });
  check("contact: bad email -> 400", r.status === 400);
  r = await fetch(`${base}/api/contact`, { method: "POST", body: new FormData(), headers: { Origin: "https://evil.example" } });
  check("contact: foreign Origin -> 403", r.status === 403);

  const id = uuid();
  r = await contact(id);
  let d = await json(r);
  check("contact: first send -> sent", r.status === 200 && d?.status === "sent" && d.duplicate === false, JSON.stringify(d));
  r = await contact(id);
  d = await json(r);
  check("contact: SAME submissionId -> duplicate, no 2nd email", r.status === 200 && d?.status === "sent" && d.duplicate === true, JSON.stringify(d));

  const career = (idv, file, filename) => {
    const f = new FormData();
    f.set("submissionId", idv);
    f.set("name", "API Test"); f.set("email", "test@example.com"); f.set("phone", "+91 90000 00000");
    f.set("position", "TEST Article Assistant"); f.set("experience", "2 years"); f.set("message", "Automated test.");
    f.set("resume", new Blob([file]), filename);
    return fetch(`${base}/api/career`, { method: "POST", body: f, headers: { Origin: origin } });
  };
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

  r = await career(uuid(), Buffer.from("MZ not a document"), "evil.pdf");
  check("career: fake PDF (wrong signature) -> 400", r.status === 400);
  r = await career(uuid(), pdf, "resume.exe");
  check("career: .exe -> 400", r.status === 400);
  r = await career(uuid(), Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024 + 10)]), "big.pdf");
  check("career: > 5 MB -> 413", r.status === 413);

  const cid = uuid();
  r = await career(cid, pdf, "resume.pdf");
  d = await json(r);
  check("career: valid PDF -> sent", r.status === 200 && d?.status === "sent" && d.duplicate === false, JSON.stringify(d));
  r = await career(cid, pdf, "resume.pdf");
  d = await json(r);
  check("career: SAME submissionId -> duplicate", r.status === 200 && d?.duplicate === true, JSON.stringify(d));

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed. Expect exactly 2 test emails in the inbox.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
