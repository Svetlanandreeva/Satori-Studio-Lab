import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Image as ImageIcon, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";

type PortfolioImage = { url: string; alt: string };
type PortfolioProject = { id: string; title: string; descriptions: string[]; images: PortfolioImage[] };
type PortfolioData = { projects: PortfolioProject[]; version: string };

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось выполнить действие";
}

export default function PortfolioAdminPage({ token }: { token: string }) {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [version, setVersion] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  async function fetchProjects() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/portfolio", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data: PortfolioData & { error?: string } = await response.json().catch(() => ({ projects: [], version: "" }));
      if (!response.ok) {
        throw new Error(response.status === 404
          ? "Серверный редактор пока недоступен. Необходимо опубликовать серверную часть Satori."
          : (data.error || "Не удалось загрузить работы: " + response.status));
      }
      if (!Array.isArray(data.projects) || !data.version) throw new Error("Сервер вернул некорректный каталог");
      setProjects(data.projects);
      setVersion(data.version);
      setSelectedId(current => data.projects.some(p => p.id === current) ? current : data.projects[0]?.id || "");
      setDirty(false);
      setSuccess("");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchProjects(); }, [token]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const selected = projects.find(p => p.id === selectedId) || null;
  const currentIndex = projects.findIndex(p => p.id === selectedId);

  function editProject(update: (project: PortfolioProject) => PortfolioProject) {
    setProjects(previous => previous.map(p => p.id === selectedId ? update(p) : p));
    setDirty(true);
    setSuccess("");
    setError("");
  }

  function moveProject(direction: number) {
    if (currentIndex < 0 || currentIndex + direction < 0 || currentIndex + direction >= projects.length) return;
    setProjects(previous => {
      const copy = [...previous];
      [copy[currentIndex], copy[currentIndex + direction]] = [copy[currentIndex + direction], copy[currentIndex]];
      return copy;
    });
    setDirty(true);
  }

  function addProject() {
    const id = "project-" + Date.now().toString(36);
    setProjects(previous => [...previous, { id, title: "Новая работа", descriptions: [], images: [] }]);
    setSelectedId(id);
    setImageUrl("");
    setDirty(true);
    setSuccess("");
  }

  function deleteProject() {
    if (!selected || projects.length < 2 || !window.confirm(`Удалить работу «${selected.title}» из каталога?`)) return;
    const remaining = projects.filter(project => project.id !== selected.id);
    setProjects(remaining);
    setSelectedId(remaining[Math.min(currentIndex, remaining.length - 1)]?.id || "");
    setDirty(true);
    setSuccess("");
  }

  function movePhoto(index: number, direction: number) {
    if (!selected || index + direction < 0 || index + direction >= selected.images.length) return;
    editProject(project => {
      const images = [...project.images];
      [images[index], images[index + direction]] = [images[index + direction], images[index]];
      return { ...project, images };
    });
  }

  function removePhoto(index: number) {
    if (!selected || !window.confirm("Убрать фотографию из этой работы?")) return;
    editProject(project => ({ ...project, images: project.images.filter((_, i) => i !== index) }));
  }

  function addImageLink() {
    if (!selected || !/^https:\/\//i.test(imageUrl.trim())) {
      setError("Укажите полную HTTPS-ссылку на изображение");
      return;
    }
    if (selected.images.length >= 50) { setError("Не более 50 фотографий на проект"); return; }
    editProject(project => ({
      ...project,
      images: [...project.images, { url: imageUrl.trim(), alt: project.title }],
    }));
    setImageUrl("");
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected || !files.length) return;
    if (selected.images.length + files.length > 50) { setError("Не более 50 фотографий на проект"); return; }
    const projectId = selected.id;
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Допускаются JPG, PNG или WebP");
        if (file.size > 10 * 1024 * 1024) throw new Error("Размер фотографии не должен превышать 10 МБ");
        const body = new FormData();
        body.append("photo", file);
        const response = await fetch("/api/admin/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "Не удалось загрузить " + file.name);
        setProjects(previous => previous.map(project => project.id === projectId
          ? { ...project, images: [...project.images, { url: result.url, alt: project.title }] }
          : project));
        setDirty(true);
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving || uploading) return;
    const invalid = projects.find(project => !project.title.trim() || !project.images.length);
    if (invalid) {
      setError("Для публикации каждой работы нужно название и хотя бы одна фотография: " + (invalid.title || "Без названия"));
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/portfolio", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projects, version }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error("Каталог изменился на сервере. Сохраните свои правки отдельно и обновите страницу.");
        throw new Error(data.error || "Не удалось опубликовать каталог");
      }
      if (!Array.isArray(data.projects) || !data.version) throw new Error("Сервер не подтвердил публикацию");
      setProjects(data.projects);
      setVersion(data.version);
      setDirty(false);
      setSuccess("Изменения опубликованы в каталоге работ.");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    if (dirty && !window.confirm("Отменить неопубликованные изменения и загрузить данные с сервера?")) return;
    await fetchProjects();
  }

  return (
    <section className="fa-portfolio">
      <header className="fa-page-head fa-portfolio-head">
        <div>
          <div className="fa-portfolio-eyebrow">SATORI / РЕДАКТИРОВАНИЕ САЙТА</div>
          <h1>Работы студии</h1>
          <p>Управляйте фотографиями, названиями и порядком проектов в каталоге.</p>
        </div>
        <div className="fa-portfolio-head-actions">
          <a className="fa-outline-button" href="/raboty" target="_blank" rel="noopener noreferrer">
            Открыть сайт <ExternalLink size={14} />
          </a>
          <button type="button" className="fa-outline-button" onClick={() => void refresh()} disabled={loading || saving || uploading}>
            <RefreshCw size={14} /> Обновить
          </button>
          <button type="button" className="fa-primary" onClick={() => void save()} disabled={!dirty || saving || uploading || loading}>
            <Save size={14} /> {saving ? "Публикуем…" : "Опубликовать"}
          </button>
        </div>
      </header>
      {dirty && <div className="fa-portfolio-notice">Есть неопубликованные изменения. Нажмите «Опубликовать», чтобы они появились на сайте.</div>}
      {error && <div className="fa-error fa-portfolio-message" role="alert">{error}</div>}
      {success && <div className="fa-portfolio-success" role="status">{success}</div>}
      {loading ? <div className="fa-card fa-portfolio-loading">Загружаем проекты…</div> :
       !projects.length && error ? <div className="fa-card fa-portfolio-loading">Редактор станет доступен после восстановления серверного API.</div> :
       <div className="fa-portfolio-layout">
         <aside className="fa-card fa-portfolio-sidebar">
           <div className="fa-portfolio-side-head">
             <strong>Проекты <span>{projects.length}</span></strong>
             <button type="button" className="fa-outline-button fa-small" onClick={addProject}><Plus size={13} /> Добавить</button>
           </div>
           <div className="fa-portfolio-project-list">
             {projects.map((project, index) =>
               <button type="button" key={project.id} className={"fa-portfolio-project" + (project.id === selectedId ? " is-active" : "")}
                 onClick={() => { setSelectedId(project.id); setImageUrl(""); }}>
                 {project.images[0]?.url ? <img src={project.images[0].url} alt="" loading="lazy"/> : <span className="fa-portfolio-no-image"><ImageIcon size={18}/></span>}
                 <span><b>{project.title || "Без названия"}</b><small>{String(index + 1).padStart(2, "0")} · {project.images.length} фото</small></span>
               </button>
             )}
           </div>
         </aside>
         {selected && <section className="fa-card fa-portfolio-editor">
           <div className="fa-portfolio-editor-head">
             <div><small>ПРОЕКТ {String(currentIndex + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}</small><h2>{selected.title || "Новая работа"}</h2></div>
             <div className="fa-portfolio-actions">
               <button type="button" className="fa-outline-button fa-small" disabled={currentIndex <= 0} onClick={() => moveProject(-1)} title="Поднять проект"><ArrowUp size={14}/></button>
               <button type="button" className="fa-outline-button fa-small" disabled={currentIndex >= projects.length - 1} onClick={() => moveProject(1)} title="Опустить проект"><ArrowDown size={14}/></button>
               <button type="button" className="fa-outline-button fa-small fa-portfolio-delete" onClick={deleteProject} disabled={projects.length < 2}><Trash2 size={14}/> Удалить</button>
             </div>
           </div>
           <label className="fa-portfolio-field">
             <span>Название работы</span>
             <input maxLength={150} value={selected.title} onChange={event => editProject(project => ({ ...project, title: event.target.value }))}/>
           </label>
           <label className="fa-portfolio-field">
             <span>Описание проекта</span>
             <textarea rows={4} value={selected.descriptions.join("\n")} onChange={event => editProject(project => ({
               ...project, descriptions: event.target.value.split("\n").map(line => line.trim()).filter(Boolean),
             }))}/>
             <small>Каждая строка станет отдельным абзацем в каталоге.</small>
           </label>
           <div className="fa-portfolio-photo-head">
             <div><h3>Фотографии</h3><p>Первый снимок — обложка. Меняйте порядок стрелками.</p></div>
             <label className="fa-outline-button fa-portfolio-upload">
               <Upload size={14}/> {uploading ? "Загрузка…" : "Загрузить"}
               <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void uploadPhotos(event)} disabled={uploading}/>
             </label>
           </div>
           <div className="fa-portfolio-images">
             {selected.images.map((photo, index) =>
               <div className="fa-portfolio-image" key={index}>
                 <a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.alt || selected.title} loading="lazy" /></a>
                 <small>{index === 0 ? "ОБЛОЖКА" : "ФОТО " + (index + 1)}</small>
                 <div className="fa-portfolio-image-actions">
                   <button type="button" title="Раньше" disabled={index === 0} onClick={() => movePhoto(index, -1)}><ArrowUp size={13}/></button>
                   <button type="button" title="Позже" disabled={index === selected.images.length - 1} onClick={() => movePhoto(index, 1)}><ArrowDown size={13}/></button>
                   <button type="button" title="Удалить" onClick={() => removePhoto(index)}><Trash2 size={13}/></button>
                 </div>
               </div>
             )}
             {!selected.images.length && <p className="fa-portfolio-image-empty">Добавьте хотя бы одну фотографию.</p>}
           </div>
           <div className="fa-portfolio-link-row">
             <input type="url" value={imageUrl} placeholder="Или ссылка HTTPS на фотографию" onChange={event => setImageUrl(event.target.value)}/>
             <button type="button" className="fa-outline-button" onClick={addImageLink}>Добавить ссылку</button>
           </div>
           <div className="fa-portfolio-bottom-actions">
             <span>Изменения вступят в силу после публикации.</span>
             <button type="button" className="fa-primary" onClick={() => void save()} disabled={!dirty || saving || uploading}><Save size={14}/> {saving ? "Сохраняем…" : "Опубликовать изменения"}</button>
           </div>
         </section>}
       </div>}
    </section>
  );
}
