export function posterSource(poster, mobile = false) {
  try {
    const url = new URL(poster);
    if (url.protocol === "https:" && url.hostname === "image.tmdb.org") {
      url.pathname = url.pathname.replace(
        /\/t\/p\/(w\d+|original)\//,
        `/t/p/${mobile ? "w185" : "w342"}/`,
      );
      return url.href;
    }
  } catch {
    /* Local artwork keeps its original URL. */
  }
  return poster;
}

export function createPosterCache({
  load,
  apply,
  dispose,
  isLive,
  isInUse,
  capacity = 128,
  concurrency = 4,
}) {
  const cache = new Map(),
    pending = new Map(),
    queue = [];
  let active = 0;
  function pump() {
    while (active < concurrency && queue.length) {
      const url = queue.shift(),
        targets = pending.get(url);
      if (![...targets].some(isLive)) {
        pending.delete(url);
        continue;
      }
      active++;
      Promise.resolve()
        .then(() => load(url))
        .then((texture) => {
          cache.set(url, texture);
          for (const target of targets)
            if (isLive(target)) apply(target, texture);
          for (const [key, value] of cache) {
            if (cache.size <= capacity) break;
            if (!isInUse(value)) {
              cache.delete(key);
              dispose(value);
            }
          }
        })
        .catch(() => {
          /* Keep the title artwork when a poster cannot load. */
        })
        .finally(() => {
          pending.delete(url);
          active--;
          pump();
        });
    }
  }
  return {
    request(url, target) {
      if (!url || !isLive(target)) return;
      if (cache.has(url)) {
        const texture = cache.get(url);
        cache.delete(url);
        cache.set(url, texture);
        apply(target, texture);
      } else {
        if (!pending.has(url)) {
          pending.set(url, new Set());
          queue.push(url);
        }
        pending.get(url).add(target);
        pump();
      }
    },
    owns: (texture) => [...cache.values()].includes(texture),
  };
}
