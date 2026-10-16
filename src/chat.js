import { icon } from "./icons.js";
import { request, capabilities } from "./api.js";
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
    footnote = "Gemini ilə · AI səhv edə bilər. Seçimləri yoxlayın.",
    busyText = "NOIR AI düşünür…",
    send,
    choose,
  },
) {
  let busy = false;
  root.innerHTML = `<div class="cinema-chat"><div class="chat-context">${icon("spark")}<span>${esc(context || "Əhvalını de. Növbəti hekayəni birlikdə tapaq.")}</span></div><div class="chat-log" role="log" aria-label="NOIR AI söhbəti" aria-live="polite" aria-relevant="additions"></div><div class="chat-suggestions">${suggestions.map((text, index) => `<button type="button" data-prompt="${index}">${esc(text)} ${icon("arrow")}</button>`).join("")}</div><p class="chat-status" role="status"></p><form class="chat-composer"><label class="sr-chat" for="chat-input">Mesajınız</label><textarea id="chat-input" rows="2" maxlength="1000" required placeholder="${esc(placeholder)}"></textarea><button type="submit" aria-label="Mesajı göndər">${icon("arrow")}</button><small>${esc(footnote)}</small></form></div>`;
  const log = root.querySelector(".chat-log");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const status = root.querySelector(".chat-status");
  function render() {
    log.innerHTML =
      `<article class="chat-message assistant"><span class="chat-avatar">${brandMark}</span><div><span class="chat-author">${esc(agentName)}</span><p>${esc(welcome)}</p></div></article>` +
      messages
        .map(
          (message, index) =>
            `<article class="chat-message ${message.role}">${message.role === "assistant" ? `<span class="chat-avatar">${brandMark}</span>` : ""}<div><span class="chat-author">${message.role === "user" ? "Sən" : esc(agentName)}</span><p>${esc(message.text)}</p>${message.films?.length ? `<div class="chat-films">${message.films.map((film, filmIndex) => `<button type="button" class="chat-film" data-message="${index}" data-choice="${filmIndex}">${film.poster ? `<img src="${esc(film.poster)}" alt="" loading="lazy">` : `<span class="chat-poster-placeholder">${brandMark}</span>`}<span><strong>${esc(film.title)}</strong><small>${esc(film.year || "")} ${film.genre ? `· ${esc(film.genre)}` : ""}</small>${film.reason ? `<span class="chat-reason">${esc(film.reason)}</span>` : ""}</span>${icon("arrow")}</button>`).join("")}</div>` : ""}</div></article>`,
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

export function createCinemaChat({ modal, esc, isLive, onFilm }) {
  let messages = [],
    selectedId = null;
  function open(film = null, prompt = "") {
    if ((film?.id || null) !== selectedId) messages = [];
    selectedId = film?.id || null;
    modal(
      `<div class="chat-heading"><div><div class="eyebrow">SƏNİN KİNO BƏLƏDÇİN</div><h2>Bu axşam hansı hekayə?</h2></div><span class="chat-badge">${icon("spark")} GEMINI</span></div><div id="cinema-chat-root"></div>`,
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
        : "Yalnız NOIR kolleksiyasından seçilmiş filmlər",
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
        if (!capabilities.runtime || !capabilities.ai || !isLive())
          throw Error(
            "Çatın işləməsi üçün Gemini və canlı kolleksiya qoşulmalıdır. Hazırda canlı AI cavabı verilmir.",
          );
        return request("/api/ai/chat", {
          method: "POST",
          data: { message, history, filmId: film?.id },
        });
      },
      choose: (choice) => onFilm(choice),
    });
    if (prompt) document.querySelector("#chat-input").value = prompt;
  }
  return { open };
}
