const RESEND_URL = "https://api.resend.com/emails";

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
  const from = process.env.EMAIL_FROM || "Bakkens Hvile <onboarding@resend.dev>";

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
