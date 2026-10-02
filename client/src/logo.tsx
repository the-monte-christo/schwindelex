/** Wordmark: handwritten, with the X slapped on in red. */
export function Logo({ tagline = false }: { tagline?: boolean }) {
  return (
    <>
      <h1 class="logo" aria-label="Schwindelex">
        <span>Schwindele</span>
        <span class="x">x</span>
      </h1>
      {tagline && <p class="tagline">Erfinde, was ein Wort bedeutet – und trau keinem Zettel.</p>}
    </>
  );
}
