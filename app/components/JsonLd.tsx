// Server-komponent, der udskriver ét JSON-LD-blok pr. dataobjekt.
// JSON.stringify + escaping af "<" forhindrer, at indhold kan bryde ud af
// script-tagget (XSS-værn) — datastrukturen kommer altid fra vores egen kode.
export default function JsonLd({ data }: { data: object | object[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(block).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
