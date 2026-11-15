/* Satori Studio /adm. Admin writes require existing server-side token auth. */
(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const loginSection = $("#adm-login");
  const adminSection = $("#adm-app");
  const loginForm = $("#adm-login-form");
  const loginError = $("#adm-login-error");
  const status = $("#adm-status");
  const tokenKey = "satori_portfolio_admin_session";
  let token = sessionStorage.getItem(tokenKey) || "";
  let projects = [];
  let version = "";
  let selectedId = null;
  let dirty = false;
  let saving = false;

  if (window.location.pathname === "/promo/adm.html") {
    // The /adm alias is provided by promo/index.html; preserve the clean address.
    history.replaceState(null, "", "/adm" + location.search + location.hash);
  }

  function setStatus(message, type = "") {
    status.textContent = message;
    status.dataset.type = type;
  }
  function markDirty() {
    dirty = true;
    setStatus("Есть неопубликованные изменения", "");
  }
  function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(path, { ...options, headers, cache: "no-store" }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || "Ошибка запроса (" + response.status + ")");
        error.status = response.status;
        throw error;
      }
      return data;
    });
  }
  function showLogin(error = "") {
    loginSection.hidden = false;
    adminSection.hidden = true;
    loginError.hidden = !error;
    loginError.textContent = error;
    if (error) $("#adm-password").focus();
  }
  function showPanel() {
    loginSection.hidden = true;
    adminSection.hidden = false;
    setStatus("Изменения сохраняются только после публикации.");
  }
  function selected() { return projects.find(project => project.id === selectedId); }
  function ensureImages(project) { return Array.isArray(project.images) ? project.images : []; }
  function newButton(text, title, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (title) button.title = title;
    if (className) button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }
  function showProjects() {
    const root = $("#adm-projects");
    root.replaceChildren();
    $("#adm-total").textContent = "(" + projects.length + ")";
    projects.forEach((project, index) => {
      const entry = newButton("", "Редактировать " + project.title, () => select(project.id), "adm-project-item");
      entry.setAttribute("role", "listitem");
      entry.setAttribute("aria-current", String(project.id === selectedId));
      const cover = document.createElement("img");
      if (project.images[0]?.url) cover.src = project.images[0].url;
      cover.alt = "";
      cover.loading = "lazy";
      const name = document.createElement("span");
      const strong = document.createElement("b");
      strong.textContent = project.title || "Новый проект";
      const detail = document.createElement("small");
      detail.textContent = String(index + 1).padStart(2, "0") + " · " + ensureImages(project).length + " фото";
      name.append(strong, detail);
      entry.append(cover, name);
      root.append(entry);
    });
  }
  function storeValues() {
    const project = selected();
    if (!project) return;
    const title = $("#adm-title").value.trim();
    const descriptions = $("#adm-description").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (project.title !== title || JSON.stringify(project.descriptions) !== JSON.stringify(descriptions)) {
      project.title = title;
      project.descriptions = descriptions;
      markDirty();
    }
  }
  function select(id) {
    storeValues();
    selectedId = id;
    showProjects();
    showEditor();
  }
  function showEditor() {
    const project = selected();
    if (!project) {
      $("#adm-edit-heading").textContent = "Выберите проект";
      $("#adm-title").value = "";
      $("#adm-description").value = "";
      $("#adm-photos").replaceChildren();
      return;
    }
    $("#adm-edit-heading").textContent = project.title || "Новый проект";
    $("#adm-title").value = project.title;
    $("#adm-description").value = (project.descriptions || []).join("\n");
    showPhotos();
  }
  function showPhotos() {
    const project = selected();
    const root = $("#adm-photos");
    root.replaceChildren();
    if (!project) return;
    const images = ensureImages(project);
    if (!images.length) {
      const note = document.createElement("p");
      note.textContent = "Добавьте минимум одну фотографию, чтобы опубликовать проект.";
      root.append(note);
      return;
    }
    images.forEach((image, index) => {
      const card = document.createElement("div");
      card.className = "adm-photo-card";
      const picture = document.createElement("img");
      picture.src = image.url;
      picture.alt = image.alt || "";
      picture.loading = "lazy";
      const label = document.createElement("small");
      label.textContent = index === 0 ? "ОБЛОЖКА · " + (index + 1) : "Фото " + (index + 1);
      const controls = document.createElement("div");
      controls.className = "adm-photo-controls";
      const back = newButton("←", "Передвинуть влево", () => movePhoto(index, -1));
      const forward = newButton("→", "Передвинуть вправо", () => movePhoto(index, 1));
      const remove = newButton("×", "Удалить фотографию", () => {
        if (images.length < 2) return;
        if (!confirm("Убрать фотографию из проекта?")) return;
        images.splice(index, 1);
        markDirty();
        showPhotos();
        showProjects();
      }, "danger");
      back.disabled = index === 0;
      forward.disabled = index === images.length - 1;
      remove.disabled = images.length < 2;
      controls.append(back, forward, remove);
      card.append(picture, label, controls);
      root.append(card);
    });
  }
  function movePhoto(index, offset) {
    const project = selected();
    if (!project) return;
    const target = index + offset;
    if (target < 0 || target >= project.images.length) return;
    [project.images[index], project.images[target]] = [project.images[target], project.images[index]];
    markDirty();
    showPhotos();
    showProjects();
  }
  function moveProject(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= projects.length) return;
    [projects[index], projects[target]] = [projects[target], projects[index]];
    markDirty();
    showProjects();
  }
  async function loadProjects() {
    const data = await request("/api/admin/portfolio");
    if (!Array.isArray(data.projects) || typeof data.version !== "string") {
      throw new Error("Неожиданный ответ сервера");
    }
    projects = data.projects;
    version = data.version;
    dirty = false;
    selectedId = projects[0]?.id || null;
    showPanel();
    showProjects();
    showEditor();
    setStatus("Каталог загружен. Изменения публикуются после сохранения.");
  }
  async function authenticate() {
    if (!token) { showLogin(); return; }
    try {
      await loadProjects();
    } catch (error) {
      if (error.status === 401) {
        token = "";
        sessionStorage.removeItem(tokenKey);
        showLogin("Сессия завершена. Введите пароль ещё раз.");
      } else {
        showLogin("Не удалось открыть редактор: " + error.message +
          ". Возможно, серверная часть ещё не обновлена.");
      }
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("#adm-password").value;
    const button = loginForm.querySelector("button[type=submit]");
    button.disabled = true;
    loginError.hidden = true;
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw new Error(data.error || "Неверный пароль");
      token = data.token;
      sessionStorage.setItem(tokenKey, token);
      $("#adm-password").value = "";
      await loadProjects();
    } catch (error) {
      showLogin(error.message + ". Проверьте пароль или обновление сервера.");
    } finally {
      button.disabled = false;
    }
  });

  $("#adm-logout").addEventListener("click", () => {
    if (dirty && !confirm("Выйти без публикации изменений?")) return;
    token = "";
    sessionStorage.removeItem(tokenKey);
    projects = [];
    dirty = false;
    showLogin();
  });
  $("#adm-title").addEventListener("input", () => {
    storeValues();
    const project = selected();
    if (project) $("#adm-edit-heading").textContent = project.title || "Новый проект";
    showProjects();
  });
  $("#adm-description").addEventListener("input", () => { storeValues(); });
  $("#adm-add-project").addEventListener("click", () => {
    storeValues();
    const id = "project-" + Date.now().toString(36);
    projects.push({ id, title: "Новый проект", descriptions: [], images: [] });
    selectedId = id;
    markDirty();
    showProjects();
    showEditor();
    $("#adm-title").focus();
  });
  $("#adm-delete-project").addEventListener("click", () => {
    const project = selected();
    if (!project) return;
    if (!confirm('Удалить проект «' + project.title + '» из каталога?')) return;
    const index = projects.findIndex(p => p.id === project.id);
    projects.splice(index, 1);
    selectedId = projects[Math.min(index, projects.length - 1)]?.id || null;
    markDirty();
    showProjects();
    showEditor();
  });
  $("#adm-add-url").addEventListener("click", () => {
    const project = selected();
    if (!project) return;
    const input = $("#adm-photo-url");
    const url = input.value.trim();
    if (!url.startsWith("https://")) {
      setStatus("Для внешней фотографии нужна ссылка HTTPS.", "error");
      return;
    }
    if (project.images.length >= 50) {
      setStatus("Лимит — 50 фотографий на проект.", "error");
      return;
    }
    project.images.push({ url, alt: project.title });
    input.value = "";
    markDirty();
    showPhotos();
    showProjects();
  });
  $("#adm-photo-upload").addEventListener("change", async event => {
    const project = selected();
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!project || !files.length) return;
    if (project.images.length + files.length > 50) {
      setStatus("Лимит — 50 фотографий на проект.", "error");
      return;
    }
    const originId = project.id;
    setStatus("Загружаем фотографии…");
    for (const file of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setStatus("Поддерживаются JPG, PNG и WebP.", "error");
        return;
      }
      const data = new FormData();
      data.append("photo", file);
      try {
        const result = await request("/api/admin/upload", { method: "POST", body: data });
        const destination = projects.find(p => p.id === originId);
        if (!destination) break;
        destination.images.push({ url: result.url, alt: destination.title });
        markDirty();
      } catch (error) {
        setStatus("Ошибка загрузки «" + file.name + "»: " + error.message, "error");
        return;
      }
    }
    showProjects();
    showPhotos();
    setStatus("Фото загружены. Нажмите «Опубликовать изменения», чтобы они появились в каталоге.");
  });

  async function publish() {
    if (saving) return;
    storeValues();
    if (!projects.length) return setStatus("Каталог должен содержать хотя бы один проект.", "error");
    for (const project of projects) {
      if (!project.title.trim() || !project.images.length) {
        return setStatus("У проекта «" + (project.title || "Без названия") + "» нет названия или фотографий.", "error");
      }
    }
    saving = true;
    $("#adm-save").disabled = true;
    $("#adm-save-bottom").disabled = true;
    setStatus("Публикуем изменения…");
    try {
      const response = await request("/api/admin/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects, version })
      });
      projects = response.projects;
      version = response.version;
      dirty = false;
      showProjects();
      showEditor();
      setStatus("Изменения опубликованы. Проверьте /raboty.", "success");
    } catch (error) {
      if (error.status === 401) {
        token = "";
        sessionStorage.removeItem(tokenKey);
        showLogin("Сессия истекла. Войдите снова.");
      } else {
        setStatus("Не удалось опубликовать: " + error.message, "error");
      }
    } finally {
      saving = false;
      $("#adm-save").disabled = false;
      $("#adm-save-bottom").disabled = false;
    }
  }
  $("#adm-save").addEventListener("click", publish);
  $("#adm-save-bottom").addEventListener("click", publish);
  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // Project-order shortcuts in the sidebar: Alt+ArrowUp / Alt+ArrowDown.
  $("#adm-projects").addEventListener("keydown", event => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const index = projects.findIndex(project => project.id === selectedId);
    if (index < 0) return;
    event.preventDefault();
    moveProject(index, event.key === "ArrowUp" ? -1 : 1);
  });
  authenticate();
})();
