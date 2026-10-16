// Rank locally before sending a compact catalogue to the provider.
export function catalogContext(films, input, selected = null, limit = 20) {
  const query = [
    input.message,
    ...(input.history || []).slice(-4).map((x) => x.text),
    selected?.genre,
    selected?.director,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("az");
  const terms = [...new Set(query.match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(
    0,
    100,
  );
  return films
    .map((film, index) => {
      const title = String(film.title || "").toLocaleLowerCase("az");
      const genre = String(film.genre || "").toLocaleLowerCase("az");
      const director = String(film.director || "").toLocaleLowerCase("az");
      const score = terms.reduce(
        (sum, term) =>
          sum +
          (title.includes(term) ? 4 : 0) +
          (genre.includes(term) ? 2 : 0) +
          (director.includes(term) ? 3 : 0),
        0,
      );
      return { film, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.film);
}
export function compactHistory(input) {
  return (input.history || [])
    .slice(-8)
    .map(({ role, text }) => ({ role, text: text.slice(0, 500) }));
}
