const TOKEN_KEY = "satori_crm_token";
let deferredInstallPrompt = null;
let pushState = "unknown";
let injecting = false;

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function token(){ return localStorage.getItem(TOKEN_KEY) || ""; }
async function authFetch(url, options={}){
  const headers={...(options.body?{"Content-Type":"application/json"}:{}),...(token()?{Authorization:`Bearer ${token()}`}:{})};
  const response=await fetch(url,{...options,headers:{...headers,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||"Ошибка запроса");
  return data;
}
function toast(text){
  const el=document.createElement("div");el.className="toast";el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);
}
async function registration(){
  if(!("serviceWorker" in navigator)) return null;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}
function base64Key(value){
  const padding="=".repeat((4-value.length%4)%4);
  const raw=atob((value+padding).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}
function closeDialog(dialog){dialog.close();dialog.remove();}
function installHelp(){
  const dialog=document.createElement("dialog");
  const content=isIOS
    ? `<p>На iPhone уведомления работают после добавления CRM на экран «Домой».</p><ol><li>Откройте CRM в Safari.</li><li>Нажмите <b>Поделиться</b>.</li><li>Выберите <b>На экран «Домой»</b>.</li><li>Откройте Satori CRM с новой иконки и нажмите «Уведомления».</li></ol>`
    : `<p>Откройте меню браузера и выберите <b>Установить приложение</b> или <b>Добавить на главный экран</b>. После установки откройте CRM с иконки.</p>`;
  dialog.innerHTML=`<div class="modal"><div class="modal-head"><div><div class="eyebrow">SATORI / PWA</div><h2>Добавить CRM на экран</h2></div><button type="button" data-close>×</button></div><div class="install-help">${content}</div><div class="modal-actions"><button class="primary" type="button" data-close>Понятно</button></div></div>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>closeDialog(dialog)));
  dialog.addEventListener("cancel",()=>dialog.remove());
  dialog.showModal();
}
async function installApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(()=>null);
    deferredInstallPrompt=null;
    injectControls();
  }else installHelp();
}
async function refreshPush(){
  if(!canPush()){pushState="unsupported";return;}
  if(Notification.permission==="denied"){pushState="denied";return;}
  try{
    const reg=await registration();
    pushState=(await reg?.pushManager.getSubscription())?"enabled":"disabled";
  }catch{pushState="disabled";}
}
function pushLabel(){return pushState==="enabled"?"🔔 Включены":pushState==="denied"?"🔕 Запрещены":"🔔 Уведомления";}
async function enablePush(){
  if(!canPush()) return toast("Этот браузер не поддерживает push-уведомления");
  if(isIOS&&!isStandalone()) return installHelp();
  const permission=await Notification.requestPermission();
  if(permission!=="granted"){pushState=permission==="denied"?"denied":"disabled";injectControls();return toast("Разрешение на уведомления не выдано");}
  try{
    const reg=await registration();
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription){
      const {publicKey}=await authFetch("/api/push/public-key");
      subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64Key(publicKey)});
    }
    await authFetch("/api/push/subscribe",{method:"POST",body:JSON.stringify({subscription:subscription.toJSON()})});
    pushState="enabled";
    injectControls();
    await authFetch("/api/push/test",{method:"POST",body:"{}"});
    toast("Уведомления включены");
  }catch(error){toast(error.message||"Не удалось включить уведомления");}
}
function injectControls(){
  if(injecting) return;
  injecting=true;
  try{
    const actions=document.querySelector(".actions");
    if(!actions||!token()) return;
    document.querySelector("#pwa-install")?.remove();
    document.querySelector("#push-toggle")?.remove();
    if(!isStandalone()){
      const install=document.createElement("button");install.type="button";install.id="pwa-install";install.className="secondary pwa-action";install.textContent="＋ На экран";install.addEventListener("click",installApp);actions.prepend(install);
    }
    if(pushState!=="unsupported"){
      const push=document.createElement("button");push.type="button";push.id="push-toggle";push.className=`secondary pwa-action ${pushState==="enabled"?"is-on":""}`;push.textContent=pushLabel();push.addEventListener("click",enablePush);actions.prepend(push);
    }
  }finally{injecting=false;}
}

window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;injectControls();});
window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;injectControls();});
const observer=new MutationObserver(()=>injectControls());
observer.observe(document.querySelector("#app"),{childList:true,subtree:true});
registration().catch(()=>null);
refreshPush().then(injectControls);
