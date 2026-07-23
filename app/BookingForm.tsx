"use client";

import { useState } from "react";

const BOOKING_EMAIL = "kontor@bakkenshvile.dk";

export default function BookingForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    date: "",
    guests: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const onChange =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const onSubmit = () => {
    const subject = encodeURIComponent("Booking af syngepigerne");
    const body = encodeURIComponent(
      `Navn: ${form.name}\nE-mail: ${form.email}\nØnsket dato: ${form.date}\nAntal gæster: ${form.guests}\n\n${form.message}`
    );
    window.location.href = `mailto:${BOOKING_EMAIL}?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="bookSuccess">
        <p className="title">Tak for din henvendelse!</p>
        <p>
          Din mailklient åbner med besked adresseret til {BOOKING_EMAIL} — vi
          vender tilbage hurtigst muligt.
        </p>
      </div>
    );
  }

  return (
    <div className="bookForm">
      <div className="bookField">
        <label>Navn</label>
        <input
          type="text"
          value={form.name}
          onChange={onChange("name")}
          placeholder="Dit navn"
        />
      </div>
      <div className="bookField">
        <label>E-mail</label>
        <input
          type="email"
          value={form.email}
          onChange={onChange("email")}
          placeholder="din@mail.dk"
        />
      </div>
      <div className="bookField">
        <label>Ønsket dato</label>
        <input
          type="text"
          value={form.date}
          onChange={onChange("date")}
          placeholder="fx 12. september 2026"
        />
      </div>
      <div className="bookField">
        <label>Antal gæster</label>
        <input
          type="text"
          value={form.guests}
          onChange={onChange("guests")}
          placeholder="fx 40"
        />
      </div>
      <div className="bookField full">
        <label>Besked</label>
        <textarea
          rows={4}
          value={form.message}
          onChange={onChange("message")}
          placeholder="Fortæl os om jeres arrangement"
        />
      </div>
      <div className="bookSubmitRow">
        <button className="bookSubmit" onClick={onSubmit}>
          Send forespørgsel
        </button>
      </div>
    </div>
  );
}
