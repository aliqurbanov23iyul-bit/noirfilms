import { icon } from "./icons.js";
import { request } from "./api.js";
import { brandMark } from "./brand.js";

export function mountChat(
  root,
  {
    esc,
    messages = [],
    welcome,
    suggestions,
    placeholder,
    context = "",
    agentName = "NOIR AI",
    footnote = "AI ilə · AI səhv edə bilər. Seçimləri yoxlayın.",
    busyText = "NOIR AI düşünür…",
    send,
    choose,
    confirmPlan,
  },
) {
  let busy = false;
  root.innerHTML = `<div class="cinema-chat"><div class="chat-context">${icon("spark")}<span>${esc(context || "Əhvalını de. Növbəti hekayəni birlikdə tapaq.")}</span></div><div class="chat-log" role="log" aria-label="NOIR AI söhbəti" aria-live="polite" aria-relevant="additions"></div><div class="chat-suggestions">${suggestions.map((text, index) => `<button type="button" data-prompt="${index}">${esc(text)} ${icon("arrow")}</button>`).join("")}</div><p class="chat-status" role="status"></p><form class="chat-composer"><label class="sr-chat" for="chat-input">Mesajınız</label><textarea id="chat-input" rows="2" maxlength="1000" required placeholder="${esc(placeholder)}"></textarea><button type="submit" aria-label="Mesajı göndər">${icon("arrow")}</button><small>${esc(footnote)}</small></form></div>`;
  const log = root.querySelector(".chat-log");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const status = root.querySelector(".chat-status");
  function renderPlan(plan, index) {
    const rows = plan.items
      .map((item) => {
        const film = item.film;
        return (
          '<div class="chat-film">' +
          (film?.poster
            ? '<img src="' + esc(film.poster) + '" alt="" loading="lazy">'
            : "") +
          "<span><strong>" +
          esc(film?.title || item.title) +
          "</strong><small>" +
          esc([film?.year, film?.director].filter(Boolean).join(" · ")) +
          '</small><span class="chat-reason">' +
          esc(
            item.status === "ready"
              ? item.action === "update"
                ? "TMDB məlumatları yenilənəcək; süjet və rəf qorunacaq"
                : "Kolleksiyaya əlavə ediləcək"
              : item.message,
          ) +
          "</span></span></div>"
        );
      })
      .join("");
    const pending =
      confirmPlan && plan.token && !plan.completed && !plan.cancelled;
    return (
      '<div class="chat-films">' +
      rows +
      "</div>" +
      (pending
        ? '<div class="admin-actions"><button type="button" class="button primary" data-confirm-plan="' +
          index +
          '">Təsdiqlə və icra et (' +
          plan.items.filter((x) => x.status === "ready").length +
          ')</button><button type="button" class="button" data-cancel-plan="' +
          index +
          '">Ləğv et</button></div>'
        : "<p>" +
          (plan.cancelled
            ? "Əməliyyat ləğv edildi."
            : plan.completed
              ? "Əməliyyatların nəticələri aşağıda göstərilir."
              : "Yazılacaq əməliyyat yoxdur.") +
          "</p>")
    );
  }
  function render() {
    log.innerHTML =
      `<article class="chat-message assistant"><span class="chat-avatar">${brandMark}</span><div><span class="chat-author">${esc(agentName)}</span><p>${esc(welcome)}</p></div></article>` +
      messages
        .map(
          (message, index) =>
            `<article class="chat-message ${message.role}">${message.role === "assistant" ? `<span class="chat-avatar">${brandMark}</span>` : ""}<div><span class="chat-author">${message.role === "user" ? "Sən" : esc(agentName)}</span><p>${esc(message.text)}</p>${message.plan ? renderPlan(message.plan, index) : ""}${message.films?.length ? `<div class="chat-films">${message.films.map((film, filmIndex) => `<button type="button" class="chat-film" data-message="${index}" data-choice="${filmIndex}">${film.poster ? `<img src="${esc(film.poster)}" alt="" loading="lazy">` : `<span class="chat-poster-placeholder">${brandMark}</span>`}<span><strong>${esc(film.title)}</strong><small>${esc(film.year || "")} ${film.genre ? `· ${esc(film.genre)}` : ""}</small>${film.reason ? `<span class="chat-reason">${esc(film.reason)}</span>` : ""}</span>${icon("arrow")}</button>`).join("")}</div>` : ""}</div></article>`,
        )
        .join("");
    log.querySelectorAll("img").forEach((img) => {
      img.onerror = () => {
        img.onerror = null;
        img.removeAttribute("src");
        img.classList.add("image-missing");
      };
    });
    log.querySelectorAll("[data-choice]").forEach((button) => {
      button.onclick = () =>
        run(async () => {
          const film =
            messages[Number(button.dataset.message)].films[
              Number(button.dataset.choice)
            ];
          const result = await choose(film);
          if (result && root.isConnected) {
            messages.push({ role: "assistant", ...result });
            render();
          }
        });
    });
    log.querySelectorAll("[data-confirm-plan]").forEach((button) => {
      button.onclick = () =>
        run(async () => {
          const plan = messages[Number(button.dataset.confirmPlan)].plan;
          const result = await confirmPlan(plan);
          plan.completed = true;
          messages.push({ role: "assistant", ...result });
          if (root.isConnected) render();
        });
    });
    log.querySelectorAll("[data-cancel-plan]").forEach((button) => {
      button.onclick = () => {
        messages[Number(button.dataset.cancelPlan)].plan.cancelled = true;
        render();
      };
    });
    log.scrollTop = log.scrollHeight;
  }
  async function run(action) {
    if (busy || !root.isConnected) return;
    busy = true;
    status.textContent = busyText;
    root.setAttribute("aria-busy", "true");
    root
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    try {
      await action();
    } catch (error) {
      if (root.isConnected) status.textContent = error.message;
    } finally {
      busy = false;
      if (root.isConnected) {
        root.removeAttribute("aria-busy");
        root
          .querySelectorAll("button")
          .forEach((button) => (button.disabled = false));
        if (status.textContent === busyText) status.textContent = "";
      }
    }
  }
  async function submit(message) {
    if (busy || !message.trim()) return;
    const history = messages
      .filter((item) => item.delivered !== false)
      .slice(-8)
      .map(({ role, text }) => ({ role, text: text.slice(0, 2000) }));
    const previous = messages.at(-1);
    if (previous?.role === "user" && previous.delivered === false)
      messages.pop();
    const entry = { role: "user", text: message.trim(), delivered: false };
    await run(async () => {
      messages.push(entry);
      render();
      // Newly rendered recommendation buttons must also stay disabled during a request.
      log
        .querySelectorAll("button")
        .forEach((button) => (button.disabled = true));
      const result = await send(entry.text, history);
      entry.delivered = true;
      if (!root.isConnected) return;
      input.value = "";
      messages.push({ role: "assistant", ...result });
      render();
    });
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    submit(input.value);
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (form.reportValidity()) submit(input.value);
    }
  };
  root.querySelectorAll("[data-prompt]").forEach((button) => {
    button.onclick = () => {
      input.value = suggestions[Number(button.dataset.prompt)];
      submit(input.value);
    };
  });
  render();
}

export function createCinemaChat({ modal, esc, onFilm }) {
  let messages = [],
    selectedId = null;
  function open(film = null, prompt = "") {
    if ((film?.id || null) !== selectedId) messages = [];
    selectedId = film?.id || null;
    modal(
      `<div class="chat-heading"><div><div class="eyebrow">SƏNİN KİNO BƏLƏDÇİN</div><h2>Bu axşam hansı hekayə?</h2></div><span class="chat-badge">${icon("spark")} NOIR AI</span></div><div id="cinema-chat-root"></div>`,
      "ai-chat-panel",
    );
    mountChat(document.querySelector("#cinema-chat-root"), {
      esc,
      messages,
      welcome: film
        ? `“${film.title}” xoşuna gəldisə, eyni hissi verən başqa hekayələr tapaq. Filmin ən çox nəyini bəyəndin?`
        : "Salam, mən NOIR AI. Sevdiyin filmi və ya bu axşamkı əhvalını de — kolleksiyadan sənə uyğun filmlər seçək.",
      context: film
        ? `${film.title} · ${film.year} əsasında seçimlər`
        : "Qeydiyyatsız söhbət et · Zövqünə uyğun film tap",
      suggestions: film
        ? [
            "Bu filmə oxşar 4 film tap",
            "Eyni janrda başqa nə var?",
            "Daha yüngül bir film istəyirəm",
          ]
        : [
            "Düşündürücü elmi fantastika",
            "Bu axşam yüngül film istəyirəm",
            "Gərgin və sirli bir hekayə",
          ],
      placeholder: "Məsələn, Interstellar kimi bir film axtarıram…",
      async send(message, history) {
        return request("/api/ai/chat", {
          method: "POST",
          data: { message, history, filmId: film?.id },
        });
      },
      choose: (choice) => onFilm(choice),
    });
    if (prompt) document.querySelector("#chat-input").value = prompt;
    document.querySelector("#chat-input").focus();
  }
  return { open };
}
