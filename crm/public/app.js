const root = document.querySelector("#app");
const TOKEN_KEY = "satori_crm_token";
const money = (n=0) => new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(Number(n)||0);
const esc = (v="") => String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmtDate = (v) => v ? new Date(v).toLocaleDateString("ru-RU",{day:"2-digit",month:"short"}) : "—";

let token = localStorage.getItem(TOKEN_KEY) || "";
let data = { stages:[], contacts:[], deals:[], tasks:[], stats:{} };
let tab = "pipeline";
let search = "";

async function api(url, options={}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? {"Content-Type":"application/json"}:{}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(options.headers||{}) };
  const res = await fetch(url,{...options,headers});
  const payload = await res.json().catch(()=>({}));
  if(res.status===401 && url!=="/api/login") { logout(); throw new Error("Сессия закончилась"); }
  if(!res.ok) throw new Error(payload.error || "Ошибка запроса");
  return payload;
}

function toast(text){
  const el=document.createElement("div");el.className="toast";el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),2300);
}

function logout(){ token="";localStorage.removeItem(TOKEN_KEY);renderLogin(); }

function renderLogin(error=""){
  root.innerHTML=`<div class="login"><form class="login-card" id="login-form"><div class="brand">SATORI</div><div class="eyebrow">LAB / CRM</div><h1>Проекты и клиенты</h1><p>Заказы и заявки с сайта плюс ручные проекты — в одной воронке. Используется тот же пароль, что и в админке Satori.</p><label class="field"><span>ПАРОЛЬ</span><input name="password" type="password" autocomplete="current-password" autofocus required></label>${error?`<div class="error">${esc(error)}</div>`:""}<button class="primary">Войти</button></form></div>`;
  root.querySelector("#login-form").addEventListener("submit",async(e)=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const result=await api("/api/login",{method:"POST",body:JSON.stringify({password:new FormData(e.currentTarget).get("password")})});token=result.token;localStorage.setItem(TOKEN_KEY,token);await load();}catch(err){renderLogin(err.message);}finally{btn.disabled=false;}});
}

async function load(){ data=await api("/api/bootstrap"); render(); }

function stats(){
  const active=data.deals.filter(d=>!d.isSpam&&d.stage!=="Завершено");
  const pipeline=active.reduce((s,d)=>s+Number(d.amount||0),0);
  const paid=data.deals.filter(d=>!d.isSpam).reduce((s,d)=>s+Number(d.paid||0),0);
  const spamDealIds=new Set(data.deals.filter(d=>d.isSpam).map(d=>d.id));
  const due=data.tasks.filter(t=>!t.done&&!spamDealIds.has(t.dealId)).length;
  return {active:active.length,pipeline,paid,due};
}

function navButton(id,label,count=""){return `<button type="button" data-tab="${id}" class="${tab===id?"active":""}"${tab===id?' aria-current="page"':""}><span>${label}</span>${count!==""?`<span class="count">${count}</span>`:""}</button>`}

function shell(content,title,subtitle){
  const s=stats();
  root.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">SATORI</div><div class="eyebrow">LAB / CRM</div><nav class="nav">${navButton("pipeline","Воронка",s.active)}${navButton("clients","Клиенты",data.contacts.length)}${navButton("tasks","Задачи",s.due)}${navButton("spam","Спам",data.deals.filter(d=>d.isSpam).length)}</nav><div class="sidebar-foot"><button type="button" data-logout>Выйти</button></div></aside><main class="main"><header class="topbar"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><button type="button" class="mobile-logout secondary" data-logout>Выйти</button><div class="actions">${tab==="pipeline"?'<button class="secondary" data-action="new-task">+ Задача</button><button class="primary" data-action="new-deal">+ Новый заказ</button>':tab==="clients"?'<button class="primary" data-action="new-client">+ Новый клиент</button>':tab==="tasks"?'<button class="primary" data-action="new-task">+ Новая задача</button>':""}</div></header>${content}</main><nav class="mobile-bar">${navButton("pipeline","Воронка")}${navButton("clients","Клиенты")}${navButton("tasks","Задачи")}${navButton("spam","Спам")}</nav></div>`;
  root.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{tab=btn.dataset.tab;search="";render();}));
  root.querySelectorAll("[data-logout]").forEach(button=>button.addEventListener("click",logout));
  root.querySelectorAll("[data-action]").forEach(btn=>btn.addEventListener("click",()=>openModal(btn.dataset.action)));
}

function statCards(){const s=stats();return `<section class="stats"><div class="stat"><span>Активные проекты</span><b>${s.active}</b><small>${data.stats.webOrders||0} заказов с сайта</small></div><div class="stat"><span>Сумма в работе</span><b>${money(s.pipeline)}</b><small>без завершённых</small></div><div class="stat"><span>Получено оплат</span><b>${money(s.paid)}</b><small>по данным CRM и сайта</small></div><div class="stat"><span>Открытые задачи</span><b>${s.due}</b><small>${data.stats.leads||0} заявок с сайта</small></div></section>`}

function sourceLabel(d){return d.source==="web"?"заказ с сайта":d.source==="lead"?"заявка с сайта":"ручной проект"}
function dealCard(d){
  const pct=d.amount?Math.min(100,Math.round((Number(d.paid||0)/Number(d.amount))*100)):0;
  return `<article class="deal" draggable="true" data-deal-id="${esc(d.id)}"><div class="source">${sourceLabel(d)}</div><h3>${esc(d.title||"Без названия")}</h3><div class="client">${esc(d.clientName||"Клиент не указан")}</div><div class="money-row"><b>${money(d.amount)}</b><small>${d.paid?`оплачено ${money(d.paid)}`:d.source==="lead"?"ожидает расчёта":"без оплаты"}</small></div><div class="progress"><i style="width:${pct}%"></i></div>${d.deadline?`<div class="deadline">Срок: ${esc(fmtDate(d.deadline))}</div>`:""}</article>`;
}

function pipelineView(){
  const stages = new Map(data.stages.map(stage => [stage, []]));
  for (const deal of data.deals) {
    if (!deal.isSpam) stages.get(deal.stage)?.push(deal);
  }
  const columns = Array.from(stages, ([stage, deals]) =>
    `<section class="column" data-stage="${esc(stage)}"><div class="column-head"><b>${esc(stage)}</b><span>${deals.length}</span></div>${deals.map(dealCard).join("")}</section>`
  ).join("");
  const mostDeals = Math.max(1, ...Array.from(stages.values(), deals => deals.length));
  const stageRows = Array.from(stages, ([stage, deals]) =>
    `<li><span>${esc(stage)}</span><meter min="0" max="${mostDeals}" value="${deals.length}" aria-hidden="true"></meter><b>${deals.length}</b></li>`
  ).join("");
  shell(
    `<section class="project-overview" aria-label="Сводка проектов">
      <div class="overview-stages"><h2>Проекты по этапам</h2><ul>${stageRows}</ul></div>
      ${statCards()}
    </section>
    <section aria-labelledby="pipeline-title">
      <h2 class="pipeline-title" id="pipeline-title">Воронка</h2>
      <div class="kanban" tabindex="0" aria-labelledby="pipeline-title">${columns}</div>
    </section>`,
    "Проекты",
    "Весь путь Satori — от первого запроса до доставки"
  );
  root.querySelectorAll(".deal").forEach(card=>{
    card.addEventListener("dragstart",()=>card.classList.add("dragging"));
    card.addEventListener("dragend",()=>card.classList.remove("dragging"));
    card.addEventListener("click",()=>openDeal(card.dataset.dealId));
  });
  root.querySelectorAll(".column").forEach(col=>{
    col.addEventListener("dragover",e=>e.preventDefault());
    col.addEventListener("drop",async(e)=>{e.preventDefault();const card=root.querySelector(".deal.dragging");if(!card)return;try{await api(`/api/deals/${encodeURIComponent(card.dataset.dealId)}`,{method:"PATCH",body:JSON.stringify({stage:col.dataset.stage})});toast("Этап обновлён");await load();}catch(err){toast(err.message);}});
  });
}


async function changeLeadSpam(deal, isSpam) {
  if(deal.source!=="lead")return;
  try{
    await api(`/api/deals/${encodeURIComponent(deal.id)}`,{method:"PATCH",body:JSON.stringify({isSpam})});
    toast(isSpam?"Заявка перемещена в «Спам»":"Заявка восстановлена");
    await load();
  }catch(error){toast(error.message||"Не удалось изменить заявку");}
}

async function removeSpamLead(deal) {
  if(deal.source!=="lead"||!deal.isSpam)return;
  if(!confirm(`Безвозвратно удалить заявку «${deal.clientName||deal.title}» и связанные с ней задачи? Это действие нельзя отменить.`))return;
  try{
    await api(`/api/deals/${encodeURIComponent(deal.id)}`,{method:"DELETE"});
    toast("Заявка удалена из сайта и CRM");
    await load();
  }catch(error){toast(error.message||"Не удалось удалить заявку");}
}

function spamView(){
  const leads=data.deals.filter(d=>d.source==="lead"&&d.isSpam);
  const list=leads.map(d=>`<article class="crm-spam-item" data-spam-id="${esc(d.id)}">
    <div class="crm-spam-info"><div class="source">ЗАЯВКА С САЙТА</div>
      <h3>${esc(d.clientName||"Без имени")}</h3>
      <p>${esc(d.notes||d.title||"Без описания")}</p>
      <small>${esc(fmtDate(d.createdAt))}</small></div>
    <div class="crm-spam-actions">
      <button type="button" class="secondary" data-spam-restore="${esc(d.id)}">Восстановить</button>
      <button type="button" class="secondary crm-spam-delete" data-spam-delete="${esc(d.id)}">Удалить навсегда</button>
    </div>
  </article>`).join("");
  shell(`<div class="crm-spam-list">${list||'<div class="empty">Спам-заявок пока нет. Здесь появятся обращения, которые вы отметили как спам.</div>'}</div>`,
    "Спам и тестовые заявки","Отсюда можно восстановить заявку или безвозвратно удалить её после подтверждения.");
  root.querySelectorAll("[data-spam-restore]").forEach(button=>button.addEventListener("click",()=>{
    const deal=leads.find(d=>d.id===button.dataset.spamRestore);
    if(deal)void changeLeadSpam(deal,false);
  }));
  root.querySelectorAll("[data-spam-delete]").forEach(button=>button.addEventListener("click",()=>{
    const deal=leads.find(d=>d.id===button.dataset.spamDelete);
    if(deal)void removeSpamLead(deal);
  }));
}

function filteredContacts(){const q=search.trim().toLowerCase();if(!q)return data.contacts;return data.contacts.filter(c=>[c.name,c.company,c.phone,c.email,c.contact].some(v=>String(v||"").toLowerCase().includes(q)));}
function clientsView(){
  const rows=filteredContacts().map(c=>`<div class="client-row"><div class="client-name"><b>${esc(c.name||"Без имени")}</b><small>${esc(c.company||"")}</small></div><div>${esc(c.phone||c.contact||"—")}</div><div>${esc(c.email||"—")}</div><div><span class="source-pill">${c.source==="manual"?"CRM":c.source==="order"?"Заказ":"Заявка"}</span></div><button class="icon-btn" data-client-id="${esc(c.id)}">•••</button></div>`).join("");
  shell(`<div class="table-wrap"><div class="toolbar"><input class="search" id="client-search" placeholder="Поиск по имени, телефону, компании…" value="${esc(search)}"></div><div class="client-grid"><div class="client-row head"><div>Клиент</div><div>Телефон / контакт</div><div>Email</div><div>Источник</div><div></div></div>${rows||'<div class="empty">Клиентов пока нет</div>'}</div></div>`,`Клиенты`,`Контакты автоматически собираются из заявок и заказов сайта`);
  const input=root.querySelector("#client-search");input?.addEventListener("input",e=>{search=e.target.value;clientsView();setTimeout(()=>{const i=root.querySelector("#client-search");i?.focus();i?.setSelectionRange(search.length,search.length)},0)});
  root.querySelectorAll("[data-client-id]").forEach(btn=>btn.addEventListener("click",()=>openClient(btn.dataset.clientId)));
}

function tasksView(){
  const items=data.tasks.slice().sort((a,b)=>Number(a.done)-Number(b.done)||String(a.due||"9999").localeCompare(String(b.due||"9999"))).map(t=>`<div class="task ${t.done?"done":""}"><input type="checkbox" data-task-toggle="${esc(t.id)}" ${t.done?"checked":""}><div><div class="task-title">${esc(t.title)}</div><small>${t.dealId?esc(data.deals.find(d=>d.id===t.dealId)?.title||"Проект"):"Общая задача"}</small></div><small>${t.due?fmtDate(t.due):"Без срока"}</small><button class="icon-btn" data-task-delete="${esc(t.id)}">×</button></div>`).join("");
  shell(`<div class="tasks-wrap">${items||'<div class="empty">Задач пока нет</div>'}</div>`,`Задачи`,`Что нужно сделать по проектам и клиентам`);
  root.querySelectorAll("[data-task-toggle]").forEach(el=>el.addEventListener("change",async()=>{await api(`/api/tasks/${encodeURIComponent(el.dataset.taskToggle)}`,{method:"PATCH",body:JSON.stringify({done:el.checked})});await load();}));
  root.querySelectorAll("[data-task-delete]").forEach(el=>el.addEventListener("click",async()=>{await api(`/api/tasks/${encodeURIComponent(el.dataset.taskDelete)}`,{method:"DELETE"});await load();}));
}

function render(){ if(!token)return renderLogin(); if(tab==="clients")return clientsView(); if(tab==="tasks")return tasksView(); if(tab==="spam")return spamView(); pipelineView(); }

function dialog(html){const d=document.createElement("dialog");d.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(d);d.addEventListener("close",()=>d.remove());d.showModal();return d;}
function field(label,name,value="",type="text",wide=false){return `<label class="field ${wide?"wide":""}"><span>${label}</span>${type==="textarea"?`<textarea name="${name}" rows="4">${esc(value)}</textarea>`:`<input name="${name}" type="${type}" value="${esc(value)}">`}</label>`}
function contactOptions(){return `<option value="">Без привязки</option>${data.contacts.map(c=>`<option value="${esc(c.id)}">${esc(c.name||"Клиент")}${c.company?` — ${esc(c.company)}`:""}</option>`).join("")}`}

function closeButtons(d){d.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click",()=>d.close()));}

function openModal(action){
  if(action==="new-client"){
    const d=dialog(`<div class="modal-head"><div><div class="eyebrow">CRM</div><h2>Новый клиент</h2></div><button data-close>×</button></div><form id="f" class="form-grid">${field("ИМЯ","name")}${field("КОМПАНИЯ","company")}${field("ТЕЛЕФОН","phone")}${field("EMAIL","email","","email")}${field("TELEGRAM / VK / WHATSAPP","contact","","text",true)}${field("ЗАМЕТКИ","notes","","textarea",true)}<div class="modal-actions wide"><button type="button" class="secondary" data-close>Отмена</button><button class="primary">Сохранить</button></div></form>`);
    closeButtons(d);d.querySelector("#f").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));await api("/api/clients",{method:"POST",body:JSON.stringify(body)});d.close();toast("Клиент добавлен");await load();});return;
  }
  if(action==="new-task"){
    const d=dialog(`<div class="modal-head"><div><div class="eyebrow">CRM</div><h2>Новая задача</h2></div><button data-close>×</button></div><form id="f" class="form-grid">${field("ЗАДАЧА","title","","text",true)}${field("СРОК","due","","date")}<label class="field"><span>ПРОЕКТ</span><select name="dealId"><option value="">Общая задача</option>${data.deals.filter(x=>x.stage!=="Завершено").map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("")}</select></label><div class="modal-actions wide"><button type="button" class="secondary" data-close>Отмена</button><button class="primary">Добавить</button></div></form>`);
    closeButtons(d);d.querySelector("#f").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));await api("/api/tasks",{method:"POST",body:JSON.stringify(body)});d.close();toast("Задача добавлена");await load();});return;
  }
  if(action==="new-deal"){
    const d=dialog(`<div class="modal-head"><div><div class="eyebrow">SATORI / PROJECT</div><h2>Новый заказ</h2></div><button data-close>×</button></div><form id="f" class="form-grid">${field("НАЗВАНИЕ ПРОЕКТА","title","","text",true)}<label class="field wide"><span>КЛИЕНТ</span><select name="clientId">${contactOptions()}</select></label>${field("СУММА, ₽","amount","","number")}${field("УЖЕ ОПЛАЧЕНО, ₽","paid","","number")}${field("СРОК","deadline","","date")}<label class="field"><span>ЭТАП</span><select name="stage">${data.stages.map(s=>`<option>${esc(s)}</option>`).join("")}</select></label>${field("ЗАМЕТКИ","notes","","textarea",true)}<div class="modal-actions wide"><button type="button" class="secondary" data-close>Отмена</button><button class="primary">Создать проект</button></div></form>`);
    closeButtons(d);d.querySelector("#f").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));const c=data.contacts.find(x=>x.id===body.clientId);body.clientName=c?.name||"";await api("/api/deals",{method:"POST",body:JSON.stringify(body)});d.close();toast("Проект создан");await load();});
  }
}

function openDeal(id){
  const deal=data.deals.find(d=>d.id===id);if(!deal)return;
  const isSystem=deal.source!=="manual";
  const isWeb=deal.source==="web";
  const d=dialog(`<div class="modal-head"><div><div class="eyebrow">${sourceLabel(deal).toUpperCase()}</div><h2>${esc(deal.title)}</h2></div><button data-close>×</button></div><form id="f" class="form-grid"><label class="field wide"><span>ЭТАП</span><select name="stage">${data.stages.map(s=>`<option ${s===deal.stage?"selected":""}>${esc(s)}</option>`).join("")}</select></label>${field("КЛИЕНТ","clientName",deal.clientName||"","text",true)}${field("СУММА, ₽","amount",deal.amount||0,"number")}${field("ОПЛАЧЕНО, ₽","paid",deal.paid||0,"number")}${field("СРОК","deadline",deal.deadline||"","date")}${isWeb?field("ТРЕК-НОМЕР","trackingCode",deal.trackingCode||""):""}${field("ЗАМЕТКИ","notes",deal.notes||"","textarea",true)}<div class="modal-actions wide">${deal.source==="lead"?`<button type="button" class="secondary" id="mark-lead-spam">${deal.isSpam?"Восстановить":"В спам"}</button>${deal.isSpam?'<button type="button" class="secondary crm-spam-delete" id="delete-lead">Удалить навсегда</button>':""}`:(!isSystem?'<button type="button" class="secondary" id="delete-deal">Удалить</button>':"")}<button class="primary">Сохранить</button></div></form>`);
  closeButtons(d);
  if(isSystem){d.querySelectorAll('input[name="clientName"],input[name="amount"],input[name="paid"],input[name="deadline"],textarea[name="notes"]').forEach(x=>x.disabled=true);}
  d.querySelector("#f").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));await api(`/api/deals/${encodeURIComponent(deal.id)}`,{method:"PATCH",body:JSON.stringify(body)});d.close();toast("Проект обновлён");await load();});
  d.querySelector("#delete-deal")?.addEventListener("click",async()=>{if(!confirm("Удалить проект из CRM?"))return;try{await api(`/api/deals/${encodeURIComponent(deal.id)}`,{method:"DELETE"});d.close();await load();}catch(err){toast(err.message);}});
  d.querySelector("#mark-lead-spam")?.addEventListener("click",async()=>{d.close();await changeLeadSpam(deal,!deal.isSpam);});
  d.querySelector("#delete-lead")?.addEventListener("click",async()=>{d.close();await removeSpamLead(deal);});
}

function openClient(id){
  const c=data.contacts.find(x=>x.id===id);if(!c)return;
  const editable=c.source==="manual";
  const d=dialog(`<div class="modal-head"><div><div class="eyebrow">${editable?"КЛИЕНТ CRM":c.source==="order"?"КЛИЕНТ ИЗ ЗАКАЗА":"КЛИЕНТ ИЗ ЗАЯВКИ"}</div><h2>${esc(c.name||"Клиент")}</h2></div><button data-close>×</button></div><form id="f" class="form-grid">${field("ИМЯ","name",c.name||"")}${field("КОМПАНИЯ","company",c.company||"")}${field("ТЕЛЕФОН","phone",c.phone||"")}${field("EMAIL","email",c.email||"","email")}${field("КОНТАКТ","contact",c.contact||"","text",true)}${editable?field("ЗАМЕТКИ","notes",c.notes||"","textarea",true):""}<div class="modal-actions wide"><button type="button" class="secondary" data-close>Закрыть</button>${editable?'<button class="primary">Сохранить</button>':""}</div></form>`);
  closeButtons(d);if(!editable){d.querySelectorAll("input,textarea").forEach(x=>x.disabled=true);return;}d.querySelector("#f").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));await api(`/api/clients/${encodeURIComponent(c.id)}`,{method:"PATCH",body:JSON.stringify(body)});d.close();toast("Клиент обновлён");await load();});
}

if(token){load().catch(err=>renderLogin(err.message));}else renderLogin();
