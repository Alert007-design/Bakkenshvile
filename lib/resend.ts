const RESEND_URL = "https://api.resend.com/emails";

// Afsenderadresse for alle udgående mails. Domænet send.bakkenshvile.dk er
// verificeret i Resend. Adressen ligger ét sted, så den kun skal rettes her —
// også når varselsmailen senere kommer til. Kan overstyres med EMAIL_FROM.
export const EMAIL_FROM =
  "Bakkens Hvile <billetter@send.bakkenshvile.dk>";

export async function sendMail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY mangler — mail blev ikke sendt");
    return;
  }
  const from = process.env.EMAIL_FROM || EMAIL_FROM;

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Resend-fejl:", body);
  }
}
