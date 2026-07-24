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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <form className="bookForm" onSubmit={onSubmit}>
      <div className="bookField">
        <label htmlFor="booking-name">Navn</label>
        <input
          id="booking-name"
          type="text"
          value={form.name}
          onChange={onChange("name")}
          placeholder="Dit navn"
          required
        />
      </div>
      <div className="bookField">
        <label htmlFor="booking-email">E-mail</label>
        <input
          id="booking-email"
          type="email"
          value={form.email}
          onChange={onChange("email")}
          placeholder="din@mail.dk"
          required
        />
      </div>
      <div className="bookField">
        <label htmlFor="booking-date">Ønsket dato</label>
        <input
          id="booking-date"
          type="text"
          value={form.date}
          onChange={onChange("date")}
          placeholder="fx 12. september 2026"
          required
        />
      </div>
      <div className="bookField">
        <label htmlFor="booking-guests">Antal gæster</label>
        <input
          id="booking-guests"
          type="text"
          value={form.guests}
          onChange={onChange("guests")}
          placeholder="fx 40"
          required
        />
      </div>
      <div className="bookField full">
        <label htmlFor="booking-message">Besked</label>
        <textarea
          id="booking-message"
          rows={4}
          value={form.message}
          onChange={onChange("message")}
          placeholder="Fortæl os om jeres arrangement"
        />
      </div>
      <div className="bookSubmitRow">
        <button type="submit" className="bookSubmit">
          Send forespørgsel
        </button>
      </div>
    </form>
  );
}
