import { request, capabilities, setCSRF, loadCapabilities } from "./api.js";
import { icon } from "./icons.js";
import { mountChat } from "./chat.js";
import { brandLogo } from "./brand.js";

export function createAdmin({ modal, toast, esc, onCatalog, getDemoAdmin }) {
  let authenticated = false,
    job = null,
    importRunning = false,
    assistantMessages = [];
  const $ = (s) => document.querySelector(s);
  const showError = (error) => {
    const e = $("#admin-message");
    if (e) {
      e.textContent = error.message;
      e.classList.add("error");
    } else toast(error.message);
  };
  async function operation(button, fn) {
    if (button) button.disabled = true;
    try {
      return await fn();
    } catch (error) {
      showError(error);
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }
  async function refresh() {
    const data = await request("/api/admin/films");
    onCatalog(data);
    return data;
  }
  function confirmation(message, action) {
    modal(
      `<div class="eyebrow">DƏYİŞİKLİYİ TƏSDİQLƏYİN</div><h2>${esc(message)}</h2><p class="body-copy secondary">Dəyişiklik canlı verilənlər bazasına tətbiq olunacaq.</p><div class="admin-actions"><button class="button primary" id="confirm-live">Təsdiqlə</button><button class="button" id="cancel-live">Ləğv et</button></div><p id="admin-message" role="status"></p>`,
    );
    $("#confirm-live").onclick = (e) => operation(e.currentTarget, action);
    $("#cancel-live").onclick = dashboard;
  }
  async function open() {
    await loadCapabilities();
    if (!capabilities.runtime || !capabilities.database || !capabilities.auth) {
      authenticated = false;
      return setup();
    }
    try {
      const current = await request("/api/auth/session");
      setCSRF(current.csrf);
      authenticated = true;
    } catch {
      authenticated = false;
      setCSRF("");
      loginForm();
      return;
    }
    await dashboard();
  }
  function setup() {
    modal(
      `<div class="admin-brand">${brandLogo}</div><div class="eyebrow">SERVER BAĞLANTILARI TAMAMLANMAYIB</div><h2>NOIR idarəetmə mərkəzi</h2><p class="body-copy secondary">Canlı admin və TOP 500 importu aktiv deyil. Bağlantılar əlavə olunana qədər baza dəyişiklikləri və AI əmrləri icra edilmir.</p><div class="connection-list">${[
        ["Server API (Vercel uyğun)", capabilities.runtime],
        ["Neon PostgreSQL", capabilities.database],
        ["Təhlükəsiz admin girişi", capabilities.auth],
        ["TMDB film məlumatları", capabilities.tmdb],
        ["NOIR AI", capabilities.ai],
      ]
        .map(
          ([label, ready]) =>
            `<div><span>${label}</span><b class="${ready ? "ready" : ""}">${ready ? "Konfiqurasiya edilib" : "Qoşulmayıb"}</b></div>`,
        )
        .join(
          "",
        )}</div><p class="body-copy">TMDB TOP 500: <strong>0 / 500 import olunub.</strong> Ekrandakı nümunələr bu siyahıya daxil deyil.</p><div class="admin-actions"><button class="button primary" id="retry-setup">Bağlantıları yenidən yoxla</button><button class="button" id="demo-admin">Yerli demo redaktoru</button></div><p class="secondary">Yerli demo yalnız bu brauzerə aiddir; server admin girişi deyil.</p>`,
    );
    $("#retry-setup").onclick = open;
    $("#demo-admin").onclick = getDemoAdmin;
    if (capabilities.database) {
      $("#content strong").textContent =
        "İmport sayı admin girişi olmadan yoxlanılmayıb.";
    }
  }
  function loginForm() {
    modal(
      `<div class="admin-brand">${brandLogo}</div><div class="eyebrow">TƏHLÜKƏSİZ ADMİN GİRİŞİ</div><h2>Kolleksiyanın pərdəarxası.</h2><form id="login-form"><label>İstifadəçi adı<input name="username" autocomplete="username" required maxlength="100"></label><label>Şifrə<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button class="button primary">Daxil ol</button></form><p class="body-copy secondary">Sessiya yalnız HttpOnly kukidə saxlanır. Şifrə və API açarları brauzer yaddaşına yazılmır.</p><p id="admin-message" role="status"></p>`,
    );
    $("#login-form").onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      operation(e.submitter, async () => {
        const user = await request("/api/auth/login", { method: "POST", data });
        setCSRF(user.csrf);
        authenticated = true;
        await dashboard();
      });
    };
  }
  async function dashboard() {
    if (!authenticated) return open();
    const { films, shelves } = await refresh();
    const imported = await request("/api/admin/import");
    job = imported.job;
    modal(
      `<div class="admin-brand">${brandLogo}</div><div class="eyebrow">CANLI NEON VERİLƏNLƏR BAZASI</div><h2>NOIR idarəetmə mərkəzi</h2><div class="admin-tabs"><button class="button primary" id="new-film">+ Film əlavə et</button><button class="button" id="manage-shelves">Rəfləri idarə et</button><button class="button" id="assistant-tab">${icon("spark")} NOIR AI</button><button class="button" id="import-tab">TOP 500 importu</button><button class="button" id="logout">Çıxış</button></div><p id="admin-message" role="status"></p><div class="admin-list">${films.map((f, i) => `<div class="admin-row"><span>${esc(f.title)}<small>${f.year} · ${esc(shelves.find((s) => s.id === f.shelfId)?.name || "Rəfsiz")}</small></span><div><button data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="${esc(f.title)} — yuxarı köçür">↑</button><button data-down="${i}" ${i === films.length - 1 ? "disabled" : ""} aria-label="${esc(f.title)} — aşağı köçür">↓</button><button data-edit="${i}">Redaktə</button><button data-delete="${i}" class="danger">Sil</button></div></div>`).join("") || '<p class="body-copy">Baza boşdur. İlk filmi əlavə edin və ya TOP 500 importunu başladın.</p>'}</div>`,
      "admin-panel",
    );
    $("#new-film").onclick = () => editor(null, shelves);
    $("#manage-shelves").onclick = () => shelfManager(shelves);
    $("#assistant-tab").onclick = assistant;
    $("#import-tab").onclick = importView;
    const searchButton = document.createElement("button");
    searchButton.className = "button";
    searchButton.textContent = "TMDB-də film axtar";
    searchButton.onclick = searchView;
    $(".admin-tabs").append(searchButton);
    const translationButton = document.createElement("button");
    translationButton.className = "button";
    translationButton.textContent = "Azərbaycan dilində süjetlər";
    translationButton.onclick = translationsView;
    $(".admin-tabs").append(translationButton);
    $("#logout").onclick = (e) =>
      operation(e.currentTarget, async () => {
        await request("/api/auth/logout", { method: "POST", data: {} });
        authenticated = false;
        setCSRF("");
        loginForm();
      });
    $("#content")
      .querySelectorAll("[data-edit]")
      .forEach(
        (b) =>
          (b.onclick = () => editor(films[Number(b.dataset.edit)], shelves)),
      );
    $("#content")
      .querySelectorAll("[data-delete]")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const f = films[Number(b.dataset.delete)];
            confirmation(`“${f.title}” silinsin?`, async () => {
              await request("/api/admin/films", {
                method: "DELETE",
                data: { id: f.id },
              });
              await dashboard();
              toast("Film bazadan silindi.");
            });
          }),
      );
    for (const dir of ["up", "down"])
      $("#content")
        .querySelectorAll(`[data-${dir}]`)
        .forEach(
          (b) =>
            (b.onclick = () =>
              operation(b, async () => {
                const i = Number(b.dataset[dir]),
                  j = i + (dir === "up" ? -1 : 1),
                  ids = films.map((f) => f.id);
                [ids[i], ids[j]] = [ids[j], ids[i]];
                await request("/api/admin/reorder", {
                  method: "POST",
                  data: { ids },
                });
                await dashboard();
              })),
        );
  }
  const labels = {
    title: "Film adı",
    year: "Buraxılış ili",
    genre: "Janr",
    director: "Rejissor",
    cast: "Aktyorlar",
    plot: "Azərbaycan dilində süjet",
    rating: "Reytinq",
    poster: "Poster keçidi",
    trailer: "YouTube video identifikatoru",
  };
  function editor(f, shelves) {
    const value = f || {
      title: "",
      year: 2026,
      genre: "Dram",
      director: "",
      cast: "",
      plot: "",
      rating: 0,
      poster: "",
      trailer: "",
      shelfId: "main",
      ratingSource: "Redaktor",
    };
    modal(
      `<div class="eyebrow">CANLI FİLM REDAKTORU</div><h2>${f ? "Filmi redaktə et" : "Yeni film əlavə et"}</h2><form id="live-film-form">${Object.entries(
        labels,
      )
        .map(
          ([key, label]) =>
            `<label>${label}${key === "plot" ? `<textarea name="${key}" rows="4">${esc(value[key])}</textarea>` : `<input name="${key}" value="${esc(value[key])}" ${["title", "genre", "year"].includes(key) ? "required" : ""} ${key === "year" ? 'type="number" min="1888" max="2100"' : key === "rating" ? 'type="number" min="0" max="10" step="0.1"' : ""}>`}</label>`,
        )
        .join(
          "",
        )}<label>Rəf<select name="shelfId">${shelves.map((s) => `<option value="${esc(s.id)}" ${s.id === value.shelfId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><label>Reytinq mənbəyi<select name="ratingSource"><option ${value.ratingSource === "Redaktor" ? "selected" : ""}>Redaktor</option><option ${value.ratingSource === "TMDB" ? "selected" : ""}>TMDB</option></select></label><div class="admin-actions"><button class="button primary">Bazaya saxla</button><button type="button" id="cancel-editor" class="button">Ləğv et</button></div></form><p id="admin-message" role="status"></p>`,
    );
    $("#cancel-editor").onclick = dashboard;
    $("#live-film-form").onsubmit = (e) => {
      e.preventDefault();
      const film = Object.fromEntries(new FormData(e.target));
      operation(e.submitter, async () => {
        await request("/api/admin/films", {
          method: f ? "PATCH" : "POST",
          data: { id: f?.id, film },
        });
        await dashboard();
        toast("Film bazaya saxlanıldı.");
      });
    };
  }
  function shelfManager(shelves) {
    modal(
      `<div class="eyebrow">KİNO OTAĞININ QURULUŞU</div><h2>Rəfləri idarə et</h2><form id="new-shelf-form"><label>Yeni rəfin adı<input name="name" required maxlength="80" placeholder="Məsələn, Sevdiyim klassiklər"></label><button class="button primary">Rəf yarat</button></form><p id="admin-message" role="status"></p><div class="admin-list">${shelves.map((s, i) => `<div class="admin-row"><label>${esc(s.name)}<input class="shelf-name" value="${esc(s.name)}" maxlength="80" data-name="${esc(s.id)}" aria-label="${esc(s.name)} — yeni ad"></label><div><button data-rename="${esc(s.id)}">Adı saxla</button><button data-shelf-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button><button data-shelf-delete="${esc(s.id)}" ${s.id === "main" ? "disabled" : ""}>Sil</button></div></div>`).join("")}</div><button class="button" id="back-dashboard">Geri</button>`,
    );
    $("#back-dashboard").onclick = dashboard;
    const refreshShelves = async () => {
      const data = await refresh();
      shelfManager(data.shelves);
    };
    $("#new-shelf-form").onsubmit = (e) => {
      e.preventDefault();
      operation(e.submitter, async () => {
        await request("/api/admin/shelves", {
          method: "POST",
          data: Object.fromEntries(new FormData(e.target)),
        });
        await refreshShelves();
      });
    };
    $("#content")
      .querySelectorAll("[data-rename]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            operation(b, async () => {
              const input = [
                ...$("#content").querySelectorAll("[data-name]"),
              ].find((i) => i.dataset.name === b.dataset.rename);
              await request("/api/admin/shelves", {
                method: "PATCH",
                data: { id: b.dataset.rename, name: input.value },
              });
              await refreshShelves();
            })),
      );
    $("#content")
      .querySelectorAll("[data-shelf-delete]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            confirmation(
              "Rəf silinsin? Filmlər əsas rəfə köçürüləcək.",
              async () => {
                await request("/api/admin/shelves", {
                  method: "DELETE",
                  data: { id: b.dataset.shelfDelete },
                });
                await dashboard();
              },
            )),
      );
    $("#content")
      .querySelectorAll("[data-shelf-up]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            operation(b, async () => {
              const i = Number(b.dataset.shelfUp),
                ids = shelves.map((s) => s.id);
              [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]];
              await request("/api/admin/reorder", {
                method: "POST",
                data: { kind: "shelves", ids },
              });
              await refreshShelves();
            })),
      );
  }
  function assistant() {
    modal(
      `<div class="chat-heading"><div><div class="eyebrow">ADMİN KÖMƏKÇİSİ · NOIR AI + TMDB</div><h2>Rəfinə yeni hekayə əlavə et.</h2></div><span class="chat-badge">${icon("spark")} NOIR AI</span></div><div id="admin-chat-root"></div><button class="text-button" id="back-dashboard">← İdarəetməyə qayıt</button>`,
      "ai-chat-panel",
    );
    $("#back-dashboard").onclick = dashboard;
    mountChat($("#admin-chat-root"), {
      esc,
      messages: assistantMessages,
      welcome:
        "Kolleksiyanı birlikdə quraq. Filmlər barədə danışa, məsləhət istəyə və əlavə etmək istədiyin filmi axtara bilərsən. Film yalnız nəticə kartını seçəndə bazaya əlavə olunur.",
      context: "Admin studiyası · Kino söhbəti və film seçimi",
      suggestions: [
        "Interstellar filmini əlavə et",
        "The Godfather (1972) filmini əlavə et",
      ],
      placeholder: "Film əlavə etmək üçün yaz…",
      async send(command, history) {
        if (!capabilities.ai)
          throw Error(
            "AI server açarı əlavə edilməlidir. TMDB axtarışı ilə AI olmadan film əlavə edə bilərsiniz.",
          );
        const data = await request("/api/admin/assistant", {
          method: "POST",
          data: { command, history },
        });
        if (data.film) {
          await refresh();
          return {
            text: data.message || `${data.film.title} bazaya əlavə edildi.`,
          };
        }
        return {
          text: data.message,
          films: (data.results || []).map((film) => ({
            ...film,
            id: String(film.tmdbId),
            reason: "Kolleksiyaya əlavə etmək üçün seç",
          })),
        };
      },
      async choose(film) {
        const result = await request("/api/admin/tmdb/add", {
          method: "POST",
          data: { tmdbId: film.tmdbId },
        });
        await refresh();
        return { text: `${result.film.title} bazaya əlavə edildi.` };
      },
    });
    const tools = document.createElement("div");
    tools.className = "admin-actions";
    tools.innerHTML =
      '<button class="button" id="check-gemini">AI bağlantısını yoxla</button><button class="button" id="tmdb-without-ai">AI olmadan film əlavə et</button><p id="admin-message" role="status"></p>';
    $("#admin-chat-root").after(tools);
    $("#tmdb-without-ai").onclick = searchView;
    $("#check-gemini").onclick = (event) =>
      operation(event.currentTarget, async () => {
        $("#admin-message").textContent =
          "AI yoxlanılır. Bu, 42 saniyəyədək çəkə bilər…";
        const response = await request("/api/admin/ai/check", {
          method: "POST",
          data: {},
        });
        if ($("#check-gemini"))
          $("#admin-message").textContent =
            `Bağlantı işləyir. ${response.text}`;
      });
  }
  function searchView() {
    modal(
      '<div class="eyebrow">TMDB · AI TƏLƏB ETMİR</div><h2>Kolleksiyaya film əlavə et</h2><p class="body-copy secondary">Filmi adı ilə tap, sonra posterli nəticəni seç. Süjeti ayrıca Azərbaycan dilinə çevirə və ya özün yaza bilərsən.</p><div id="tmdb-search-root"></div><p id="admin-message" role="status"></p><button class="text-button" id="back-dashboard">← İdarəetməyə qayıt</button>',
      "ai-chat-panel",
    );
    $("#back-dashboard").onclick = dashboard;
    mountChat($("#tmdb-search-root"), {
      agentName: "TMDB",
      footnote: "TMDB məlumatları · Seçdiyiniz film bazaya əlavə olunur.",
      busyText: "TMDB sorğusu işlənir…",
      esc,
      welcome: "Əlavə etmək istədiyin filmin adını yaz.",
      context: "Birbaşa TMDB axtarışı · Film kartını seçərək əlavə et",
      suggestions: ["Interstellar", "The Godfather", "Arrival"],
      placeholder: "Film adı…",
      async send(title) {
        const result = await request("/api/admin/tmdb/search", {
          method: "POST",
          data: { title },
        });
        return {
          text: result.results.length
            ? "Əlavə etmək istədiyin filmi seç."
            : "Uyğun film tapılmadı.",
          films: result.results.map((film) => ({
            ...film,
            id: String(film.tmdbId),
            reason: "Bazaya əlavə et",
          })),
        };
      },
      async choose(film) {
        const result = await request("/api/admin/tmdb/add", {
          method: "POST",
          data: { tmdbId: film.tmdbId, translate: false },
        });
        await refresh();
        return {
          text: `${result.film.title} bazaya əlavə edildi. Süjeti Azərbaycan dilində süjetlər bölməsində tamamlaya bilərsiniz.`,
        };
      },
    });
  }
  async function translationsView() {
    const { films } = await refresh();
    const missing = films.filter((film) => !film.plot?.trim() && film.tmdbId);
    modal(
      `<div class="eyebrow">AZƏRBAYCAN DİLİNDƏ SÜJETLƏR</div><h2>Hər filmin öz hekayəsi.</h2><p class="body-copy">${missing.length} filmin süjeti tərcümə gözləyir. Hazır mətnlər və redaktorun yazdığı açıqlamalar dəyişdirilmir.</p><div class="admin-actions"><button class="button primary" id="translate-plots" ${!missing.length ? "disabled" : ""}>Çatışmayan süjetləri tamamla</button><button class="button" id="stop-translations">Dayandır</button><button class="button" id="back-dashboard">Geri</button></div><p id="translation-progress" role="status"></p><p id="admin-message" role="status"></p><p class="body-copy secondary">AI əlçatmaz olarsa proses saxlanır. Kolleksiya bölməsində Redaktə seçərək açıqlamanı özünüz də Azərbaycan dilində yaza bilərsiniz.</p>`,
    );
    const progress = $("#translation-progress");
    let stop = false;
    $("#stop-translations").onclick = () => {
      stop = true;
      progress.textContent = "Cari filmdən sonra dayanacaq.";
    };
    $("#back-dashboard").onclick = () => {
      stop = true;
      dashboard();
    };
    $("#translate-plots").onclick = (event) =>
      operation(event.currentTarget, async () => {
        stop = false;
        let done = 0;
        const failed = [];
        for (const film of missing) {
          if (stop || !progress.isConnected) break;
          progress.textContent = `${done} / ${missing.length} · ${film.title} tərcümə edilir…`;
          try {
            await request("/api/admin/translate", {
              method: "POST",
              data: { id: film.id },
            });
            done++;
          } catch (error) {
            if (error.code !== "AI_INVALID_OUTPUT") throw error;
            failed.push(film.title);
          }
          if (progress.isConnected)
            progress.textContent = `${done} süjet tamamlandı. ${failed.length} film sonra yenidən yoxlanacaq.${failed.length ? " · " + failed.join(", ") : ""}`;
          if (done < missing.length && !stop)
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        await refresh();
      });
  }
  function importView() {
    let stopped = false;
    modal(
      `<div class="eyebrow">TMDB-NİN ƏN YÜKSƏK REYTİNQLİ FİLMLƏRİ</div><h2>TOP 500 kolleksiyası</h2><p class="body-copy secondary">Siyahı import başladığı tarixdə sabitlənir. TMDB reytinqi IMDb reytinqi kimi göstərilmir. Məlumatlar, rejissor, aktyorlar və poster serverdə alınır.</p><p class="body-copy">${capabilities.ai ? "Əvvəlcə filmləri gətirə, istəsəniz aşağıdakı seçimlə AI tərcüməsini də qoşa bilərsiniz." : "TMDB-də Azərbaycan dilində süjet yoxdursa, tərcümə hazır deyil kimi işarələnəcək. AI açarı qoşulanda tərcümə mümkündür."}</p><div class="import-progress"><progress id="import-meter" max="500" value="${job?.imported || 0}"></progress><p id="import-status">${job?.imported || 0} / 500 film import olunub.</p></div><div class="admin-actions"><button class="button primary" id="start-import" ${!capabilities.tmdb ? "disabled" : ""}>${job?.status === "running" ? "İmporta davam et" : "500 filmin importunu başlat"}</button><button class="button" id="stop-import">Cari filmdən sonra dayandır</button><button class="button" id="back-dashboard">Geri</button></div><p id="admin-message" role="status"></p>`,
    );
    $("#back-dashboard").onclick = () => {
      stopped = true;
      dashboard();
    };
    $("#stop-import").onclick = () => {
      stopped = true;
      $("#import-status").textContent =
        "Cari sorğu bitdikdən sonra import dayanacaq. Sonra davam edə bilərsiniz.";
    };
    const importMeter = $("#import-meter");
    const translationChoice = document.createElement("label");
    translationChoice.className = "import-translation-choice";
    translationChoice.innerHTML = `<input id="import-translate" type="checkbox" ${capabilities.ai ? "" : "disabled"}><span>İmport zamanı süjetləri AI ilə tərcümə et<small>Bağlı saxlasanız, AI sorğusu göndərilmir. TMDB-də Azərbaycan dilində süjet varsa götürülür; qalanları sonra tamamlamaq olar. NOIR AI çatları aktiv qalır.</small></span>`;
    importMeter.closest(".import-progress").before(translationChoice);
    const warning = document.createElement("p");
    warning.className = "body-copy secondary";
    warning.id = "import-warning";
    importMeter.closest(".import-progress").append(warning);
    const showWarning = () => {
      warning.textContent = job?.untranslated
        ? `${job.untranslated} filmin Azərbaycan dilində süjeti hələ hazır deyil. Digər məlumatları saxlanılıb; tərcümələr sonra tamamlana bilər.`
        : "";
    };
    showWarning();
    $("#start-import").onclick = (e) => {
      if (importRunning) {
        toast("Cari import sorğusu bitdikdən sonra davam edin.");
        return;
      }
      importRunning = true;
      operation(e.currentTarget, async () => {
        stopped = false;
        if (job?.status !== "running")
          job = (
            await request("/api/admin/import/start", {
              method: "POST",
              data: {},
            })
          ).job;
        while (
          !stopped &&
          $("#import-meter") === importMeter &&
          job.status === "running"
        ) {
          job = (
            await request("/api/admin/import/step", {
              method: "POST",
              data: {
                id: job.id,
                translate: translationChoice.querySelector("input").checked,
              },
            })
          ).job;
          const meter = $("#import-meter"),
            label = $("#import-status");
          if (meter !== importMeter || !label) break;
          meter.value = job.imported || job.cursor;
          label.textContent = `${job.imported || job.cursor} / 500 film import olunub.`;
          showWarning();
          if (!stopped && job.status === "running")
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        await refresh();
        if ($("#import-meter") === importMeter && $("#import-status"))
          $("#import-status").textContent =
            job.status === "complete"
              ? "500 / 500 — import tamamlandı."
              : "İmport dayandırılıb; davam etmək mümkündür.";
      }).finally(() => {
        importRunning = false;
        if ($("#import-meter") === importMeter)
          $("#start-import").textContent =
            job?.status === "running"
              ? "İmporta davam et"
              : "500 filmin importunu başlat";
      });
    };
  }
  async function openSection(view) {
    await open();
    if (authenticated) await view();
  }
  return {
    open,
    openAssistant: () => openSection(assistant),
    openSearch: () => openSection(searchView),
    openTranslations: () => openSection(translationsView),
    openImport: () => openSection(importView),
  };
}
