if (process.env.QA_ALLOW_TRANSACTIONAL_EMAIL !== "1") {
  throw new Error("qa_explicit_opt_in_required");
}

const key = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL;
if (!key || !from) throw new Error("resend_env_missing");

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `qa-xgo-email-${new Date().toISOString().slice(0, 10)}`,
  },
  body: JSON.stringify({
    from,
    to: ["delivered@resend.dev"],
    subject: "QA X-GO - entrega transacional",
    html: "<p>Validacao automatizada do canal transacional X-GO.</p>",
    text: "Validacao automatizada do canal transacional X-GO.",
  }),
});
const sent = await response.json();
if (!response.ok || !sent.id) throw new Error(`resend_send_http_${response.status}`);

await new Promise((resolve) => setTimeout(resolve, 2_000));
const lookup = await fetch(`https://api.resend.com/emails/${sent.id}`, {
  headers: { Authorization: `Bearer ${key}` },
});
const email = await lookup.json();
if (!lookup.ok) throw new Error(`resend_get_http_${lookup.status}`);

process.stdout.write("RESEND_SEND_ACCEPTED=PASS\n");
process.stdout.write(`RESEND_LAST_EVENT=${email.last_event ?? "unknown"}\n`);
