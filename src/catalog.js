export function filmGenres(film) {
  return String(film.genre || "")
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
}

export function catalogGenres(films) {
  return [...new Set(films.flatMap(filmGenres))];
}
