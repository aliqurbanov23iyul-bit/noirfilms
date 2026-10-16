import { createAdmin } from "./admin.js";
import { brandLogo, brandMark } from "./brand.js";
import { icon } from "./icons.js";
import "./style.css";
import "./chat.css";
import "./admin-page.css";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
document.querySelector("#studio-app").innerHTML =
  `<header class="studio-header"><a class="logo" href="/" aria-label="NOIR CINEMA — sayta qayıt">${brandLogo}</a><span>NOIR STUDIO <small>Şəxsi kino idarəetmə məkanın</small></span><a class="button" href="/">Sayta bax ${icon("arrow")}</a></header><div class="studio-layout"><aside class="studio-sidebar"><span class="eyebrow">PƏRDƏARXASI</span><nav aria-label="Admin bölmələri"><button data-studio="open">${icon("grid")} Kolleksiya</button><button data-studio="openAssistant">${icon("spark")} AI ilə söhbət</button><button data-studio="openSearch">${icon("search")} Film əlavə et</button><button data-studio="openTranslations">${icon("list")} Azərbaycan dilində süjetlər</button><button data-studio="openImport">${icon("shuffle")} TOP 500 importu</button></nav><div class="studio-sidebar-note">${brandMark}<p>Yaxşı kolleksiya<br>yaxşı söhbətdən başlayır.</p></div></aside><main class="studio-main"><div id="studio-error" class="studio-error" role="alert" hidden></div><section class="studio-workspace"><div id="content" aria-live="polite"><p class="body-copy">İdarəetmə hazırlanır…</p></div></section></main></div><div id="toast" role="status"></div>`;
let toastTimer;
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 4500);
}
function modal(html, type = "standard") {
  const workspace = document.querySelector(".studio-workspace");
  workspace.className = `studio-workspace ${type}`;
  document.querySelector("#content").innerHTML = html;
  document.querySelector("#studio-error").hidden = true;
  const heading = document.querySelector("#content h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
const catalogueChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("noir-catalogue")
    : null;
function updateCatalog({ films }) {
  catalogueChannel?.postMessage({ type: "changed" });
  document
    .querySelector('[data-studio="open"]')
    .setAttribute("aria-label", `Kolleksiya — ${films.length} film`);
}
const studio = createAdmin({
  modal,
  toast,
  esc,
  onCatalog: updateCatalog,
  getDemoAdmin: () =>
    toast("Canlı film idarəetməsi üçün Neon və admin girişi qurulmalıdır."),
});
function showError(error) {
  const node = document.querySelector("#studio-error");
  node.textContent = error.message;
  node.hidden = false;
}
document.querySelectorAll("[data-studio]").forEach((button) => {
  button.onclick = async () => {
    document.querySelectorAll("[data-studio]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.disabled = true;
    });
    try {
      await studio[button.dataset.studio]();
    } catch (error) {
      showError(error);
    } finally {
      document
        .querySelectorAll("[data-studio]")
        .forEach((item) => (item.disabled = false));
    }
  };
});
document.querySelector('[data-studio="open"]').classList.add("active");
studio.open().catch(showError);
