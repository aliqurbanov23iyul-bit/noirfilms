import { gsap } from "gsap";
import { films as originals } from "./data.js";
import { localize, genres } from "./locale.js";
import { icon } from "./icons.js";
import { createRoom } from "./room.js";
import { createAdmin } from "./admin.js";
import { request, capabilities, loadCapabilities } from "./api.js";
import { filmGenres, catalogGenres } from "./catalog.js";
import { createCinemaChat } from "./chat.js";
import { brandLogo, brandMark } from "./brand.js";
import "./style.css";
import "./chat.css";
const seed = originals.map(localize),
  $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
function read(key, fallback) {
  try {
    const x = JSON.parse(localStorage.getItem(key));
    return Array.isArray(x) ? x : fallback;
  } catch {
    return fallback;
  }
}
let films = read("noir-films", seed).map((f) => {
    const original = originals.find((x) => x.id === f.id);
    return {
      ...f,
      poster:
        (f.id === "chungking" &&
          f.poster?.includes("43I9DcNoCzpyzK8JCkJYpHqHqMG")) ||
        (f.id === "perfect-days" &&
          f.poster?.includes("aIkGJw4T6JolMhuT9V7VZMlmA1Z"))
          ? original.poster
          : f.poster,
      genre: genres[f.genre] || f.genre,
      plot:
        original && f.plot === original.plot ? localize(original).plot : f.plot,
    };
  }),
  saved = read("noir-saved", []),
  filtered = [],
  genre = "",
  view = "3d",
  lastFocus = null,
  dialogToken = 0;
let inspectedFilm = null;
let liveCatalog = false,
  shelves = [{ id: "main", name: "Əsas kolleksiya" }],
  shelfFilter = "";
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast("Yaddaş əlçatan deyil. Dəyişikliklər yalnız bu sessiyada qalacaq.");
  }
}
document.documentElement.lang = "az";
document.title = "NOIR CINEMA — Kino rəfiniz";
$("#app").innerHTML =
  `<div id="loader" aria-live="polite"><div class="logo">${brandLogo}</div><div class="load-line"></div><p>Kino məkanınız hazırlanır</p></div><header class="header"><a class="logo" href="/" aria-label="NOIR CINEMA — əsas səhifə">${brandLogo}</a><nav aria-label="Əsas menyu"><button class="nav-link active" id="collection">Kolleksiya</button><button class="nav-link" id="picks">Kolleksiyam <span id="saved-count">${saved.length}</span></button><button class="nav-link" id="about">Haqqında</button></nav><button class="icon-button" id="admin" aria-label="İdarəetmə mərkəzi" title="İdarəetmə mərkəzi">${icon("settings")}</button></header><main><section class="intro"><div><div class="eyebrow"><span></span> KİNONUN ÖZ MƏKANI</div><h1>Kinonun <span>içindəsən.</span></h1></div><p>Otağa daxil ol. Rəflərə göz gəzdir.<br> Növbəti hekayəni özün seç.</p></section><section class="archive" aria-label="Film arxivi"><div class="toolbar"><label class="search-box">${icon("search")}<input id="search" type="search" placeholder="Film və ya rejissor axtar…" aria-label="Film və ya rejissor axtar"></label><label class="genre-control">${icon("filter")}<select id="genre" aria-label="Janr seç"><option value="">Bütün janrlar</option>${catalogGenres(
    films,
  )
    .map((g) => `<option>${esc(g)}</option>`)
    .join(
      "",
    )}</select></label><button class="subtle-button" id="random">${icon("shuffle")}<span>Təsadüfi film</span></button><div class="view-toggle" aria-label="Görünüş rejimi"><button id="view-3d" class="selected" aria-pressed="true">${icon("grid")} 3D rəf</button><button id="view-list" aria-pressed="false">${icon("list")} Siyahı</button></div></div><div class="archive-head"><span class="section-label">SEÇİLMİŞ KOLLEKSİYA <b id="film-count"></b></span><span class="edition"><span id="data-state">YERLİ NÜMAYİŞ · 12 FİLM</span></span></div><div class="room-options"><label>Rəf <select id="shelf-filter"><option value="">Bütün rəflər</option></select></label><label>Otaq bölməsi <select id="room-section"><option value="0">1 / 1</option></select></label><button class="text-button" id="room-reset">Baxışı sıfırla</button></div><div class="room-stage"><div id="case-status" class="case-status hidden" role="status">Qutu rəfdən çıxarılır və açılır…</div><div id="case-controls" class="case-controls hidden"><button class="button primary" id="case-details">Film məlumatları</button><button class="button" id="case-return">Rəfə qaytar</button></div><canvas id="scene" tabindex="0" aria-label="3D kino otağı. Sürükləyərək sağa-sola baxın, qutuya toxunaraq filmi seçin."></canvas><div class="room-shade"></div><div id="empty" class="empty-state hidden"><h2>Bu rəf hələ boşdur.</h2><p>Axtarışı və ya janr filtrini dəyişin.</p><button class="button" id="clear">Filtrləri təmizlə</button></div><div class="shelf-caption"><span id="hover-title">Kino ilə üz-üzə.</span><span id="hover-meta">Bir film seçin və hekayəyə yaxınlaşın.</span></div><div class="shelf-number">01 <span>—</span> KİNO ARXİVİ</div></div><div id="film-list" class="film-list hidden"></div><div class="archive-foot"><p id="help"><span class="help-dot"></span><span class="desktop-hint">Sürükləyərək baxın · Qutunu seçin</span><span class="mobile-hint">Otağa göz gəzdirin · Qutuya toxunun</span></p><div class="shelf-nav"><button class="icon-button" id="prev" aria-label="Sola bax">${icon("arrow")}</button><span><b id="page">01</b><i>/</i><span id="pages">01</span></span><button class="icon-button" id="next" aria-label="Sağa bax">${icon("arrow")}</button></div><p class="keyboard-hint"><kbd>←</kbd><kbd>→</kbd> otaqda sağa-sola baxış</p></div></section><section class="closing"><span class="closing-symbol">${brandMark}</span><p>Bəzi filmlər bitmir.<br><span>Sadəcə bizimlə qalır.</span></p><span class="closing-note">Kino həvəskarları üçün<br>diqqətlə seçilmiş hekayələr.</span></section></main><footer><span>Created by <b>ok4nnerr</b></span><span class="footer-note">© ${new Date().getFullYear()} NOIR CINEMA</span><div class="socials"><a href="https://instagram.com/ok4nnerr" target="_blank" rel="noopener" aria-label="Instagram — ok4nnerr">${icon("instagram")}<span>Instagram</span></a><a href="https://www.tiktok.com/@ok4nnerr" target="_blank" rel="noopener" aria-label="TikTok — ok4nnerr">${icon("tiktok")}<span>TikTok</span></a></div></footer><div id="overlay" class="overlay hidden" role="dialog" aria-modal="true" aria-label="Film məlumatları"><section class="panel"><button class="icon-button close" aria-label="Pəncərəni bağla">${icon("close")}</button><div id="content"></div></section></div><div id="toast" role="status"></div>`;
let toastTimer;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
const room = createRoom($("#scene"), {
  onSelect: select,
  onSection: (p, total) => {
    $("#room-section").innerHTML = Array.from(
      { length: total },
      (_, i) =>
        `<option value="${i}" ${i === p - 1 ? "selected" : ""}>${i + 1} / ${total}</option>`,
    ).join("");
  },
  onPage: (p, total) => {
    $("#page").textContent = String(p).padStart(2, "0");
    $("#pages").textContent = String(total).padStart(2, "0");
    $("#prev").disabled = p === 1;
    $("#next").disabled = p === total;
  },
  onHover: (f) => {
    $("#hover-title").textContent = f?.title || "Kino ilə üz-üzə.";
    $("#hover-meta").textContent = f
      ? `${f.year} · ${f.director}`
      : "Bir film seçin və hekayəyə yaxınlaşın.";
  },
  onReady: () =>
    gsap.to("#loader", {
      opacity: 0,
      duration: 0.35,
      delay: 0.3,
      onComplete: () => $("#loader")?.remove(),
    }),
  onError: () =>
    setTimeout(() => {
      $("#loader")?.remove();
      setView("list");
      toast("3D görünüş bu cihazda açılmadı. Siyahı rejimi aktivdir.");
    }, 0),
});
function list(items) {
  return items
    .map(
      (f) =>
        `<button class="film-row" data-film="${esc(f.id)}"><img src="${esc(f.poster)}" alt="" loading="lazy"><span class="list-name">${esc(f.title)}<small>${esc(f.director)}</small></span><span>${f.year}</span><span class="list-genre">${esc(f.genre)}</span><span class="list-rating">★ ${f.rating}</span>${icon("arrow")}</button>`,
    )
    .join("");
}
function bindFilms(root) {
  root
    .querySelectorAll("[data-film]")
    .forEach(
      (b) =>
        (b.onclick = () => select(films.find((f) => f.id === b.dataset.film))),
    );
  imageFallbacks(root);
}
function filter() {
  dialogToken++;
  inspectedFilm = null;
  $("#case-controls").classList.add("hidden");
  $("#case-status").classList.add("hidden");
  $("#data-state").textContent = liveCatalog
    ? `CANLI KOLLEKSİYA · ${films.length} FİLM`
    : `YERLİ NÜMAYİŞ · ${films.length} FİLM`;
  const q = $("#search").value.toLocaleLowerCase("az");
  filtered = films.filter(
    (f) =>
      (!genre || filmGenres(f).includes(genre)) &&
      (!shelfFilter || f.shelfId === shelfFilter) &&
      `${f.title} ${f.director} ${f.year}`.toLocaleLowerCase("az").includes(q),
  );
  room.setFilms(filtered);
  $("#film-count").textContent = String(filtered.length).padStart(2, "0");
  $("#film-list").innerHTML = list(filtered);
  bindFilms($("#film-list"));
  $("#empty").classList.toggle("hidden", filtered.length > 0);
  $(".shelf-caption").classList.toggle("hidden", filtered.length === 0);
  if (!filtered.length)
    $("#film-list").innerHTML =
      '<div class="list-empty">Uyğun film tapılmadı. Filtrləri dəyişin.</div>';
}
function clear() {
  shelfFilter = "";
  $("#shelf-filter").value = "";
  genre = "";
  $("#genre").value = "";
  $("#search").value = "";
  filter();
}
$("#clear").onclick = clear;
$("#genre").onchange = (e) => {
  genre = e.target.value;
  filter();
};
$("#search").oninput = filter;
function setView(next) {
  view = next;
  $(".room-stage").classList.toggle("hidden", next === "list");
  $("#film-list").classList.toggle("hidden", next === "3d");
  for (const v of ["3d", "list"]) {
    $("#view-" + v).classList.toggle("selected", next === v);
    $("#view-" + v).setAttribute("aria-pressed", String(next === v));
  }
  for (const s of [".shelf-nav", "#help", ".keyboard-hint"])
    $(s).classList.toggle("hidden", next === "list");
  $(".room-options label:nth-child(2)").classList.toggle(
    "hidden",
    next === "list",
  );
  $("#room-reset").classList.toggle("hidden", next === "list");
  room.setVisible(next === "3d");
  if (next === "3d") room.resize();
}
$("#view-3d").onclick = () => setView("3d");
$("#view-list").onclick = () => setView("list");
$("#prev").onclick = () => room.step(-1);
$("#next").onclick = () => room.step(1);
$("#random").onclick = () =>
  filtered.length
    ? select(filtered[Math.floor(Math.random() * filtered.length)])
    : toast("Əvvəlcə axtarış filtrini dəyişin.");
function modal(html, type = "standard") {
  dialogToken++;
  if ($("#overlay").classList.contains("hidden"))
    lastFocus = document.activeElement;
  $(".panel").className = `panel ${type}`;
  $("#content").innerHTML = html;
  const heading = $("#content h2");
  if (heading) {
    heading.id = "modal-heading";
    $("#overlay").setAttribute("aria-labelledby", heading.id);
  } else $("#overlay").removeAttribute("aria-labelledby");
  $("#overlay").classList.remove("hidden");
  document.body.classList.add("dialog-open");
  $(".close").focus();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.fromTo(
    $(".panel"),
    { y: reduced ? 0 : 24, opacity: 0 },
    { y: 0, opacity: 1, duration: reduced ? 0.01 : 0.4 },
  );
  imageFallbacks($("#content"));
}
function close() {
  dialogToken++;
  inspectedFilm = null;
  $("#case-controls").classList.add("hidden");
  $("#case-status").classList.add("hidden");
  $("#overlay").classList.add("hidden");
  document.body.classList.remove("dialog-open");
  room.reset();
  lastFocus?.focus();
}
$(".close").onclick = close;
$("#overlay").onclick = (e) => {
  if (e.target === $("#overlay")) close();
};
function imageFallbacks(root) {
  root.querySelectorAll("img").forEach((img) => {
    img.onerror = () => {
      img.onerror = null;
      img.classList.add("image-missing");
      img.removeAttribute("src");
      img.alt = "Poster hazırda əlçatan deyil";
    };
  });
}
async function select(f, skipAnimation = false) {
  if (!f) return;
  if (view === "3d" && !filtered.some((item) => item.id === f.id)) clear();
  inspectedFilm = f;
  const token = ++dialogToken;
  if (view === "3d" && !skipAnimation) {
    $("#case-controls").classList.remove("hidden");
    $("#case-status").classList.remove("hidden");
    await room.focus(f.id);
    if (token !== dialogToken) return;
    $("#case-status").classList.add("hidden");
  }
  modal(
    `<div class="detail-art"><img class="detail-poster" src="${esc(f.poster)}" alt="${esc(f.title)} — film posteri"><span class="poster-note">NOIR SEÇİMİ · KİNO ARXİVİ</span></div><div class="detail-content"><div class="eyebrow">HEKAYƏYƏ YAXINLAŞIN</div><h2>${esc(f.title)}</h2><div class="film-meta"><span>${f.year}</span><i></i><span>${esc(f.genre)}</span><span class="rating"><b>${esc(f.ratingSource || "IMDb")}</b> ★ ${f.rating}</span></div><p class="plot">${esc(f.plot || "Bu film üçün Azərbaycan dilində süjet hələ əlavə edilməyib.")}</p><dl class="credits"><div><dt>Rejissor</dt><dd>${esc(f.director)}</dd></div><div><dt>Aktyorlar</dt><dd>${esc(f.cast)}</dd></div></dl><div class="detail-actions"><a class="button primary" href="https://www.youtube.com/watch?v=${encodeURIComponent(f.trailer)}" target="_blank" rel="noopener">${icon("play")} Treylerə bax</a><button class="button" id="save">${icon(saved.includes(f.id) ? "check" : "heart")} ${saved.includes(f.id) ? "Kolleksiyamdadır" : "Kolleksiyama əlavə et"}</button></div><button class="text-button inspect-case" id="inspect-case">Açılmış 3D qutuya bax →</button><div class="ai-actions"><button id="analyze">${icon("spark")} AI ilə analiz et</button><button id="similar">Oxşar filmləri tap ${icon("arrow")}</button></div><div id="result" class="result" aria-live="polite"></div><p class="metadata-note">${liveCatalog ? "TMDB və redaktor məlumatları · Reytinqlər zamanla dəyişir." : "Yerli nümayiş kolleksiyası · Canlı TOP 500 deyil."}</p></div>`,
    "film-panel",
  );
  if (!f.trailer) {
    const link = $(".detail-actions a");
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.setAttribute("aria-disabled", "true");
    link.textContent = "Treyler hələ əlavə edilməyib";
  }
  $("#inspect-case").onclick = async () => {
    const token = dialogToken;
    const outsideFilter = !filtered.some((item) => item.id === f.id);
    if (outsideFilter) clear();
    if (view !== "3d" || outsideFilter) {
      setView("3d");
      await room.focus(f.id);
    }
    if (token !== dialogToken) return;
    $("#overlay").classList.add("hidden");
    document.body.classList.remove("dialog-open");
    $("#case-controls").classList.remove("hidden");
    $("#scene").focus();
  };
  $("#save").onclick = () => {
    saved = saved.includes(f.id)
      ? saved.filter((id) => id !== f.id)
      : [...saved, f.id];
    write("noir-saved", saved);
    $("#saved-count").textContent = saved.length;
    $("#save").innerHTML =
      `${icon(saved.includes(f.id) ? "check" : "heart")} ${saved.includes(f.id) ? "Kolleksiyamdadır" : "Kolleksiyama əlavə et"}`;
    toast(
      saved.includes(f.id)
        ? "Film kolleksiyanıza əlavə edildi."
        : "Film kolleksiyanızdan çıxarıldı.",
    );
  };
  $("#analyze").onclick = () => ai("analyze", f);
  $("#similar").onclick = () => cinemaChat.open(f, "Bu filmə oxşar 4 film tap");
}
async function ai(action, film) {
  const token = dialogToken;
  $("#result").innerHTML = "<p>Kino köməkçisi yoxlanılır…</p>";
  try {
    if (!capabilities.ai || !liveCatalog) throw Error();
    const data = await request(`/api/ai/${action}`, {
      method: "POST",
      data: { filmId: film.id },
    });
    if (token !== dialogToken) return;
    $("#result").textContent = data.text;
  } catch {
    if (token !== dialogToken || !$("#result")) return;
    $("#result").innerHTML =
      `<p><strong>AI cavabı alınmadı.</strong><br>${esc("Gemini bağlantısını və canlı kolleksiyanı yoxlayın, yaxud bir qədər sonra yenidən cəhd edin.")}</p><button class="text-button" id="curated">Seçilmiş 4 alternativə bax →</button>`;
    $("#curated").onclick = () => {
      const picks = films
        .filter((f) => f.id !== film.id)
        .sort(
          (a, b) =>
            Number(b.genre === film.genre) - Number(a.genre === film.genre),
        )
        .slice(0, 4);
      $("#result").innerHTML =
        '<p class="alternative-label">Janra əsaslanan seçim · AI tərəfindən yaradılmayıb</p><div class="alternatives">' +
        picks
          .map(
            (f) =>
              `<button data-film="${esc(f.id)}">${esc(f.title)} <span>${f.year}</span></button>`,
          )
          .join("") +
        "</div>";
      bindFilms($("#result"));
    };
  }
}
$("#collection").onclick = () => {
  close();
  clear();
  $(".archive").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
};
$("#about").onclick = () =>
  modal(
    '<div class="eyebrow">NOIR HAQQINDA</div><h2>Kino üçün<br>ayrılmış bir məkan.</h2><p class="body-copy">NOIR CINEMA fiziki film kolleksiyasını kəşf etməyin zövqündən ilhamlanır. Sevdiyiniz hekayəyə qayıdın, yeni bir rejissorla tanış olun və ya seçimi təsadüfə buraxın.</p><p class="body-copy secondary">Bu, nümunə film məlumatları ilə hazırlanmış nümayiş platformasıdır. Poster hüquqları müvafiq sahiblərinə məxsusdur. Kolleksiyanız və demo dəyişiklikləri yalnız istifadə etdiyiniz brauzerdə saxlanır.</p>',
  );
$("#picks").onclick = () => {
  const items = films.filter((f) => saved.includes(f.id));
  modal(
    `<div class="eyebrow">ŞƏXSİ KİNO RƏFİNİZ</div><h2>Kolleksiyam <span class="count">${items.length}</span></h2><p class="body-copy secondary">Bu cihazda saxladığınız filmlər.</p>${items.length ? list(items) : '<div class="list-empty">İlk filminiz üçün yer hazırdır. Film seçib kolleksiyanıza əlavə edin.</div>'}`,
  );
  bindFilms($("#content"));
};
function persist() {
  write("noir-films", films);
  const selectedGenre = $("#genre").value;
  $("#genre").innerHTML =
    '<option value="">Bütün janrlar</option>' +
    catalogGenres(films)
      .map((g) => `<option>${esc(g)}</option>`)
      .join("");
  $("#genre").value = selectedGenre;
  genre = $("#genre").value;
  filter();
}
function confirmAction(message, action) {
  modal(
    `<div class="eyebrow">DƏYİŞİKLİYİ TƏSDİQLƏYİN</div><h2>${esc(message)}</h2><p class="body-copy secondary">Bu əməliyyat yalnız bu brauzerdəki nümayiş kolleksiyasına aiddir.</p><div class="admin-actions"><button class="button primary" id="confirm-action">Bəli, davam et</button><button class="button" id="cancel-action">Ləğv et</button></div>`,
  );
  $("#confirm-action").onclick = action;
  $("#cancel-action").onclick = admin;
}
function admin() {
  if (liveCatalog) {
    toast("Canlı bazada yerli demo redaktoru açılmır.");
    return;
  }
  modal(
    `<div class="eyebrow">YERLİ NÜMAYİŞ REJİMİ</div><h2>Kolleksiyanı idarə et.</h2><p class="body-copy secondary">Dəyişikliklər yalnız bu brauzerdə saxlanır. Server autentifikasiyası və verilənlər bazası hələ qoşulmayıb.</p><div class="admin-actions"><button class="button primary" id="add-film">+ Film əlavə et</button><button class="button" id="reset">Nümunələri bərpa et</button></div><div class="admin-list">${films.map((f, i) => `<div class="admin-row"><span>${esc(f.title)}<small>${f.year}</small></span><div><button data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="${esc(f.title)} — yuxarı köçür">↑</button><button data-down="${i}" ${i === films.length - 1 ? "disabled" : ""} aria-label="${esc(f.title)} — aşağı köçür">↓</button><button data-edit="${i}">Redaktə</button><button data-delete="${i}" class="danger">Sil</button></div></div>`).join("")}</div>`,
  );
  $("#add-film").onclick = () => editFilm();
  $("#reset").onclick = () => {
    confirmAction(
      "Yerli dəyişikliklər silinsin və nümunələr bərpa edilsin?",
      () => {
        films = structuredClone(seed);
        persist();
        admin();
      },
    );
  };
  $("#content")
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => editFilm(Number(b.dataset.edit))));
  $("#content")
    .querySelectorAll("[data-delete]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          confirmAction("Film yerli kolleksiyadan silinsin?", () => {
            films.splice(Number(b.dataset.delete), 1);
            persist();
            admin();
          });
        }),
    );
  for (const direction of ["up", "down"])
    $("#content")
      .querySelectorAll(`[data-${direction}]`)
      .forEach(
        (b) =>
          (b.onclick = () => {
            const i = Number(b.dataset[direction]),
              j = i + (direction === "up" ? -1 : 1);
            if (j >= 0 && j < films.length) {
              [films[i], films[j]] = [films[j], films[i]];
              persist();
              admin();
            }
          }),
      );
}
const labels = {
  title: "Film adı",
  year: "Buraxılış ili",
  genre: "Janr",
  director: "Rejissor",
  cast: "Aktyorlar",
  plot: "Qısa süjet",
  rating: "IMDb reytinqi",
  poster: "Poster keçidi (https:// və ya /)",
  trailer: "YouTube video identifikatoru",
};
function editFilm(index) {
  const f = films[index] || {
    title: "",
    year: 2026,
    genre: "Dram",
    director: "",
    cast: "",
    plot: "",
    rating: 0,
    poster: "",
    trailer: "",
  };
  modal(
    `<div class="eyebrow">YERLİ FİLM REDAKTORU</div><h2>${index === undefined ? "Yeni hekayə əlavə et." : "Film məlumatları."}</h2><form id="film-form">${Object.keys(
      labels,
    )
      .map(
        (k) =>
          `<label>${labels[k]}${k === "plot" ? `<textarea name="plot" rows="4">${esc(f[k])}</textarea>` : `<input name="${k}" value="${esc(f[k])}" ${["title", "year", "genre", "director", "poster"].includes(k) ? "required" : ""} ${k === "year" ? 'type="number" min="1888" max="2100"' : k === "rating" ? 'type="number" min="0" max="10" step="0.1"' : k === "poster" ? 'type="text" pattern="(https://|/).*"' : ""}>`}</label>`,
      )
      .join(
        "",
      )}<div class="admin-actions"><button class="button primary">Dəyişiklikləri saxla</button><button type="button" class="button" id="cancel-edit">Geri qayıt</button></div></form>`,
  );
  $("#cancel-edit").onclick = admin;
  $("#film-form").onsubmit = (e) => {
    e.preventDefault();
    const value = Object.fromEntries(new FormData(e.target));
    value.year = Number(value.year);
    value.rating = Number(value.rating);
    value.id = f.id || crypto.randomUUID();
    if (index === undefined) films.push(value);
    else films[index] = value;
    persist();
    admin();
    toast("Film məlumatları saxlanıldı.");
  };
}
const liveAdmin = createAdmin({
  modal,
  toast,
  esc,
  onCatalog: applyCatalog,
  getDemoAdmin: admin,
});
$("#admin").onclick = () =>
  liveAdmin.open().catch((error) => toast(error.message));
const cinemaChat = createCinemaChat({
  modal,
  esc,
  isLive: () => liveCatalog,
  onFilm: (film) => select(film),
});
const chatNav = document.createElement("button");
chatNav.className = "nav-link chat-nav";
chatNav.innerHTML = `${icon("spark")} NOIR AI`;
chatNav.onclick = () => cinemaChat.open();
$(".header nav").append(chatNav);
const chatLauncher = document.createElement("button");
chatLauncher.className = "chat-launcher";
chatLauncher.innerHTML = `${brandMark}<span>Bir film tapaq<span>NOIR AI ilə söhbət et</span></span>${icon("arrow")}`;
chatLauncher.setAttribute("aria-label", "NOIR AI kino çatını aç");
chatLauncher.onclick = () => cinemaChat.open();
document.body.append(chatLauncher);

const footer = $("footer");
let footerVisible = false;
function updateChatClearance() {
  document.documentElement.style.setProperty(
    "--chat-footer-clearance",
    footerVisible
      ? `${Math.ceil(footer.getBoundingClientRect().height)}px`
      : "0px",
  );
}
new IntersectionObserver(([entry]) => {
  footerVisible = entry.isIntersecting;
  updateChatClearance();
}).observe(footer);
new ResizeObserver(updateChatClearance).observe(footer);

document.addEventListener("keydown", (e) => {
  if (!$("#overlay").classList.contains("hidden")) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "Tab") {
      const elements = [
        ...$("#overlay").querySelectorAll(
          "button:not([disabled]),a,input,select,textarea",
        ),
      ].filter((x) => x.getClientRects().length);
      if (e.shiftKey && document.activeElement === elements[0]) {
        e.preventDefault();
        elements.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === elements.at(-1)) {
        e.preventDefault();
        elements[0].focus();
      }
    }
    return;
  }
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "Escape") {
    if (!inspectedFilm && $(".archive").classList.contains("immersive")) {
      expandRoom.click();
      return;
    }
    close();
    return;
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    room.step(-1);
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    room.step(1);
  }
  if (e.key === "Enter" && e.target === $("#scene") && filtered.length)
    room.openCurrent();
});
filter();

function applyCatalog(data) {
  films = data.films;
  shelves = data.shelves;
  liveCatalog = true;
  $("#data-state").textContent = `CANLI KOLLEKSİYA · ${films.length} FİLM`;
  rebuildCatalogControls();
  filter();
}
function rebuildCatalogControls() {
  const currentGenre = $("#genre").value;
  $("#genre").innerHTML =
    '<option value="">Bütün janrlar</option>' +
    catalogGenres(films)
      .map((g) => `<option>${esc(g)}</option>`)
      .join("");
  $("#genre").value = currentGenre;
  genre = $("#genre").value;
  $("#shelf-filter").innerHTML =
    '<option value="">Bütün rəflər</option>' +
    shelves
      .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
      .join("");
  $("#shelf-filter").value = shelfFilter;
  if (!$("#shelf-filter").value) shelfFilter = "";
}
$("#room-section").onchange = (e) => room.setSection(Number(e.target.value));
$("#room-reset").onclick = close;
$("#shelf-filter").onchange = (e) => {
  shelfFilter = e.target.value;
  filter();
};
loadCapabilities().then(async () => {
  if (capabilities.database) {
    try {
      applyCatalog(await request("/api/catalog"));
    } catch (error) {
      $("#data-state").textContent =
        "BAZA BAĞLANTISI ALINMADI · YERLİ NÜMUNƏLƏR";
      toast(error.message);
    }
  }
});

$("#case-details").onclick = () => {
  if (inspectedFilm) select(inspectedFilm, true);
};
$("#case-return").onclick = close;

const expandRoom = document.createElement("button");
expandRoom.className = "text-button";
expandRoom.id = "room-expand";
expandRoom.textContent = "Otağı böyüt";
expandRoom.setAttribute("aria-pressed", "false");
$(".room-options").append(expandRoom);
expandRoom.onclick = () => {
  const expanded = $(".archive").classList.toggle("immersive");
  document.body.classList.toggle("immersive-room", expanded);
  expandRoom.textContent = expanded ? "Adi görünüşə qayıt" : "Otağı böyüt";
  expandRoom.setAttribute("aria-pressed", String(expanded));
  room.resize();
};
const roomAdmin = document.createElement("button");
roomAdmin.className = "text-button room-studio";
roomAdmin.textContent = "İdarəetmə";
roomAdmin.onclick = () => $("#admin").click();
$(".room-options").append(roomAdmin);
