// The website backend talks to the authenticated CRM through its existing internal API.
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const base = (process.env.CRM_V2_INTERNAL_URL || 'http://127.0.0.1:3020').replace(/\/$/, '');
let connectionFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'crm-connection.json');
export function configureCrmConnectionFile(filename) { connectionFile = filename; }
async function connection() {
  try { return { ...JSON.parse(await readFile(connectionFile, 'utf8')), enabled: true }; }
  catch (error) { if (error.code === 'ENOENT') return { url: base, enabled: Boolean(process.env.CRM_V2_INTERNAL_URL) }; throw error; }
}
export async function crmConnectionInfo() {
  const current = await connection();
  return { url: current.url, enabled: current.enabled, authenticated: Boolean(current.cookie) };
}
function validConnectionUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Укажите адрес основной CRM Satori.'); }
  const allowed = new Set(['crm.satorilabural.online', 'crm.satorilabural.ru', 'crm.crmsatori.ru', new URL(base).hostname]);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((!local && (url.protocol !== 'https:' || (url.port && url.port !== '443'))) || (local && !['http:', 'https:'].includes(url.protocol))
    || !allowed.has(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('Укажите HTTPS-адрес основной CRM Satori.');
  }
  return url.origin;
}
async function connectionFetch(url, options) {
  try { return await fetch(url, options); }
  catch { throw new Error('Не удалось соединиться с CRM по указанному адресу.'); }
}
export async function saveCrmConnection(body) {
  const url = validConnectionUrl(String(body?.url || '').trim());
  const previous = await connection();
  let cookie = previous.url === url ? previous.cookie : undefined;
  const password = String(body?.password || '');
  if (password.length > 512) throw new Error('Проверьте пароль CRM.');
  if (password) {
    const response = await connectionFetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: String(body?.login || '').trim().slice(0, 200), password }), signal: AbortSignal.timeout(8000), redirect: 'error' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 429 ? 'CRM ограничила попытки входа. Повторите позже.' : 'Не удалось войти в CRM. Проверьте пароль владельца.');
    if (data?.actor?.role !== 'owner') throw new Error('Для синхронизации нужен доступ владельца CRM.');
    cookie = response.headers.get('set-cookie')?.match(/(?:^|,\s*)(satori_crm_session=[^;,\s]+)/)?.[1];
    if (!cookie) throw new Error('CRM не вернула сессию владельца.');
  }
  const response = await connectionFetch(url + '/api/deals?includeDuplicates=1', { headers: { ...(cookie ? { Cookie: cookie } : {}) },
    signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 401 ? 'Для этой CRM укажите пароль владельца.' : 'CRM не отвечает по указанному адресу.');
  if (!Array.isArray(await response.json())) throw new Error('По указанному адресу не найден API CRM.');
  const temporary = `${connectionFile}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(connectionFile), { recursive: true });
    await writeFile(temporary, JSON.stringify({ url, cookie }), { mode: 0o600, flag: 'wx' });
    await rename(temporary, connectionFile);
  } finally { await rm(temporary, { force: true }); }
  return { url, authenticated: Boolean(cookie), notice: 'Основная CRM подключена. Заказы и проекты будут синхронизироваться.' };
}
const stageNames = { planned: 'Расчёт', 'in-progress': 'В производстве', done: 'Завершено', canceled: 'Отказ' };
const fulfillment = { 'В производстве': 'В работе', 'Готово': 'Собран', 'Доставка': 'Отправлен клиенту', 'Завершено': 'Выполнен', 'Отказ': 'Отменён' };
const projectStage = (name) => name === 'Завершено' ? 'done' : name === 'Отказ' ? 'canceled' : ['В производстве', 'Готово', 'Доставка'].includes(name) ? 'in-progress' : 'planned';
const day = (value) => typeof value === 'string' ? value.slice(0, 10) : '';
const sum = (rows) => (rows || []).reduce((total, row) => total + row.amount, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function crmRequest(url, method = 'GET', body) {
  const config = await connection();
  if (!config.enabled) throw new Error('Внешняя CRM не подключена. Заказы сайта доступны во встроенной CRM.');
  let response;
  try { response = await fetch(config.url + url, { method, headers: { 'Content-Type': 'application/json', ...(config.cookie ? { Cookie: config.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000), redirect: 'error' }); }
  catch { throw new Error('Нет соединения с основной CRM. Проверьте подключение в настройках CRM сайта.'); }
  if (response.status === 401) throw new Error('Нужна авторизация в основной CRM. Подключите её в настройках CRM сайта.');
  if (!response.ok) throw new Error(`CRM недоступна (HTTP ${response.status}).`);
  return response.status === 204 ? null : response.json();
}

export function remoteOrder(deal) {
  const storeId = String(deal.notes || '').match(/\[store-order:([^\]]+)\]/)?.[1];
  return { id: storeId || `crm:${deal.id}`, crmDealId: deal.id, crmContactId: deal.contactId, customerId: deal.contactId ? `crm:${deal.contactId}` : undefined, crmId: deal.id, source: 'crm',
    crmNumber: `CRM-${deal.id.slice(0, 8).toUpperCase()}`, crmStatus: deal.stageName || 'Новый запрос',
    fulfillmentStatus: fulfillment[deal.stageName] || 'Новый', status: 'manual',
    customer: { name: deal.contactName || '', email: deal.contactEmail || '' },
    items: [{ name: deal.title, qty: 1, price: Number(deal.value || 0) / 100 }],
    amount: Number(deal.value || 0) / 100, createdAt: deal.createdAt };
}

export async function crmOrders() {
  const deals = await crmRequest('/api/deals?includeDuplicates=1');
  if (!Array.isArray(deals)) throw new Error('CRM вернула некорректный список заказов.');
  return deals.map(remoteOrder);
}

function projection(project) {
  return { name: project.name, price: project.price, status: project.status || '',
    dueDate: project.dueDate || '', startDate: project.startDate || '', shipmentDate: project.shipmentDate || '',
    received: sum(project.payments), spent: sum(project.expenses) };
}
const costKeys = ['productionCost', 'deliveryCost', 'packagingCost', 'contractorCost', 'paymentCommission', 'taxCost', 'otherCost'];

async function remoteState(dealId) {
  const [deal, stages, projects] = await Promise.all([crmRequest(`/api/deals/${encodeURIComponent(dealId)}`), crmRequest('/api/pipeline'), crmRequest('/api/projects')]);
  const stage = stages.find((item) => item.id === deal.stageId);
  const economics = deal.economics || {};
  const projectDetails = projects.find((item) => item.dealId === dealId);
  const contact = await crmRequest(`/api/contacts/${encodeURIComponent(deal.contactId)}`);
  return { deal, stages, contact, economics, projectDetails, fields: { name: deal.title, price: Number(deal.value || 0),
    status: projectStage(stage?.name), dueDate: day(projectDetails?.contractDeadline || deal.schedule?.deadline || deal.expectedClose),
    startDate: day(projectDetails?.orderedAt || deal.schedule?.paidAt), shipmentDate: day(projectDetails?.shippedAt || deal.schedule?.shippedAt),
    received: Number(economics.receivedAmount || 0), spent: Number(projectDetails?.directCost ?? costKeys.reduce((n, key) => n + Number(economics[key] || 0), 0)) } };
}

function importTotal(rows, target, label) {
  const manual = rows.filter((row) => row.syncSource !== 'crm');
  const remainder = target - sum(manual);
  if (remainder < 0) throw new Error('Сумма в CRM меньше уже внесённых операций проекта. Сверьте оплаты и расходы перед синхронизацией.');
  return remainder ? [...manual, { label, date: '', amount: remainder, syncSource: 'crm' }] : manual;
}

function applyRemote(project, fields, keys) {
  for (const key of keys) {
    if (key === 'received') project.payments = importTotal(project.payments || [], fields.received, 'Оплаты из CRM');
    else if (key === 'spent') project.expenses = importTotal(project.expenses || [], fields.spent, 'Расходы из CRM');
    else project[key] = fields[key];
  }
}

function notesForProject(project, existing) {
  const start = `[satori-project:${project.id}]`, end = `[/satori-project:${project.id}]`;
  const notes = String(existing || '');
  const from = notes.indexOf(start), to = notes.indexOf(end, from);
  const other = from >= 0 && to >= 0 ? notes.slice(0, from) + notes.slice(to + end.length) : notes;
  const lines = [start, `Проект: ${project.name}`, project.notes || '',
    `Контакты: ${(project.contacts || []).map((item) => [item.name, item.details].filter(Boolean).join(' — ')).join('; ')}`,
    `Начало: ${project.startDate || '—'} · Срок: ${project.dueDate || '—'} · Отгрузка: ${project.shipmentDate || '—'}`,
    `Накладная: ${project.waybill || '—'}`,
    `Расходы: ${(sum(project.expenses) / 100).toFixed(2)} ₽ · Получено: ${(sum(project.payments) / 100).toFixed(2)} ₽`,
    ...(project.steps || []).map((step) => `${step.name}: ${step.status} ${step.notes || ''}`),
    `Документы и подробности: https://satorilabural.ru/admin?project=${encodeURIComponent(project.id)}`, end];
  return [other.trim(), lines.filter(Boolean).join('\n')].filter(Boolean).join('\n\n');
}

async function customerContact(project, deals) {
  const contacts = await crmRequest('/api/contacts?includeRejected=1');
  const first = project.customer ? { name: project.customer.name, details: [project.customer.phone, project.customer.email, project.customer.contactHandle].filter(Boolean).join(' · ') } : project.contacts?.[0];
  const marker = project.customerId ? `[satori-customer:${project.customerId}]` : `[satori-project-contact:${project.id}]`;
  const sourceDeal = project.customerSourceDealId ? deals.find((deal) => deal.id === project.customerSourceDealId) : null;
  const contactId = project.crmContactId || sourceDeal?.contactId;
  let contact = contactId ? contacts.find((item) => item.id === contactId) : null;
  if (!contact) contact = contacts.find((item) => String(item.notes || '').includes(marker));
  if (!contact) {
    const details = first?.details || '';
    const email = details.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
    const phone = details.match(/\+?[\d ()-]{10,}/)?.[0];
    contact = await crmRequest('/api/contacts', 'POST', { name: first?.name || project.name, email, phone,
      notes: marker, source: 'website', qualification: 'qualified' });
  }
  project.crmContactId = contact.id;
  project.customerId = `crm:${contact.id}`;
  if (project.customer) project.customer = { ...project.customer, name: contact.name || project.customer.name,
    phone: contact.phone || project.customer.phone, email: contact.email || project.customer.email };
  return contact;
}

async function findOrCreateDeal(project, order) {
  if (order.crmDealId) return order.crmDealId;
  const deals = await crmRequest('/api/deals?includeDuplicates=1');
  const found = deals.find((deal) => String(deal.notes || '').includes(`[satori-project:${project.id}]`)
    || String(deal.notes || '').includes(`[store-order:${order.id}]`));
  if (found) return found.id;
  const contact = await customerContact(project, deals);
  const stages = await crmRequest('/api/pipeline');
  const stage = stages.find((item) => item.name === (stageNames[project.status] || 'Расчёт'));
  const created = await crmRequest('/api/deals', 'POST', { title: project.name, value: project.price || 0,
    contactId: contact.id, stageId: stage?.id, manual: true, notes: notesForProject(project, '') });
  return created.id;
}

// Only fields changed since the previous successful exchange are written. Concurrent
// edits to the same field are reported instead of silently overwriting CRM data.
export async function syncCrmProject(project, order, { linking = false, push = false } = {}) {
  try {
    const config = await connection();
    if (!config.enabled) {
      project.crmSync = order.source === 'crm' || order.crmDealId
        ? { ...project.crmSync, state: 'pending', message: 'Этот заказ связан с внешней CRM. Подключите её в настройках для обмена данными.' }
        : { state: 'local', at: new Date().toISOString() };
      return null;
    }
    const dealId = await findOrCreateDeal(project, order);
    project.crmDealId = dealId;
    let remote = await remoteState(dealId);
    if (project.customerChangePending) {
      const deals = await crmRequest('/api/deals?includeDuplicates=1');
      const contact = await customerContact(project, deals);
      if (contact.id !== remote.contact.id) {
        await crmRequest(`/api/deals/${encodeURIComponent(dealId)}`, 'PUT', { contactId: contact.id });
        remote = await remoteState(dealId);
      }
      delete project.customerChangePending;
    }
    project.crmContactId = remote.contact.id;
    project.customerId = `crm:${remote.contact.id}`;
    if (project.customer) project.customer = { ...project.customer, name: remote.contact.name || project.customer.name,
      phone: remote.contact.phone || '', email: remote.contact.email || '' };
    const previous = project.crmSync?.dealId === dealId ? project.crmSync : null;
    const local = projection(project);
    const firstExistingLink = !previous && (linking || order.source === 'crm');
    if (firstExistingLink) {
      applyRemote(project, remote.fields, ['name', 'price', 'status', 'dueDate', 'startDate', 'shipmentDate']);
      // Existing detailed rows are preserved. Missing CRM totals are imported as
      // separate operations, never disguised as confirmed online payments.
      for (const key of ['received', 'spent']) {
        if (remote.fields[key] < local[key]) throw new Error('В проекте уже внесены операции на большую сумму, чем в CRM. Привязка сохранена, но суммы требуют сверки.');
        applyRemote(project, remote.fields, [key]);
      }
      const details = [remote.contact.phone, remote.contact.email].filter(Boolean).join(' · ');
      const contact = { name: remote.contact.name || '', details };
      if ((contact.name || details) && !(project.contacts || []).some((item) => same(item, contact))) project.contacts = [...(project.contacts || []), contact];
    }
    if (previous?.contact) {
      const updated = { name: remote.contact.name || '', details: [remote.contact.phone, remote.contact.email].filter(Boolean).join(' · ') };
      const index = (project.contacts || []).findIndex((contact) => same(contact, previous.contact));
      if (index >= 0) project.contacts[index] = updated;
    }
    const current = projection(project);
    const changed = previous ? Object.keys(current).filter((key) => !same(current[key], previous.local[key]))
      : firstExistingLink ? [] : Object.keys(current);
    const remoteChanged = previous ? Object.keys(remote.fields).filter((key) => !same(remote.fields[key], previous.remote[key])) : [];
    const conflicts = changed.filter((key) => remoteChanged.includes(key) && !same(current[key], remote.fields[key]));
    if (conflicts.length) throw new Error('Данные изменены одновременно в проекте и CRM. Сверьте название, сумму, статус, даты и операции перед сохранением.');
    applyRemote(project, remote.fields, remoteChanged.filter((key) => !changed.includes(key)));
    if (push || changed.length) {
      const patch = {};
      if (changed.includes('name')) patch.title = project.name;
      if (changed.includes('price') && project.price !== null) patch.value = project.price;
      if (changed.includes('dueDate')) patch.expectedClose = project.dueDate || null;
      if (changed.includes('startDate')) patch.paidAt = project.startDate || null;
      if (changed.includes('status')) {
        const stage = remote.stages.find((item) => item.name === stageNames[project.status]);
        if (stage) { patch.stageId = stage.id; if (project.status === 'canceled') patch.lossReason = project.notes || 'Отмена в карточке проекта'; }
      }
      patch.notes = notesForProject(project, remote.deal.notes);
      await crmRequest(`/api/deals/${encodeURIComponent(dealId)}`, 'PUT', patch);
      if (['startDate', 'dueDate', 'shipmentDate'].some((key) => changed.includes(key))) {
        const details = remote.projectDetails || {};
        await crmRequest('/api/projects', 'PUT', { dealId, orderedAt: project.startDate || null,
          contractDeadline: project.dueDate || null, shippedAt: project.shipmentDate || null,
          productionTermDays: null, paymentTerms: details.paymentTerms || null, notes: details.notes || null });
      }
      if (changed.includes('received')) await crmRequest(`/api/deals/${encodeURIComponent(dealId)}`, 'PUT', { receivedAmount: sum(project.payments) });
      if (changed.includes('spent')) {
        const other = costKeys.filter((key) => key !== 'productionCost').reduce((n, key) => n + Number(remote.economics[key] || 0), 0);
        if (sum(project.expenses) < other) throw new Error('Расходы проекта меньше отдельных затрат в CRM. Сверьте категории расходов.');
        await crmRequest('/api/economics', 'PUT', { ...remote.economics, dealId,
          productionCost: sum(project.expenses) - other, receivedAmount: sum(project.payments) });
      }
    }
    const actual = await remoteState(dealId);
    if (['startDate', 'dueDate', 'shipmentDate'].some((key) => changed.includes(key) && actual.fields[key] !== projection(project)[key])) {
      throw new Error('CRM не применила даты проекта. Проверьте этап сделки и условия срока производства в CRM.');
    }
    if (['received', 'spent'].some((key) => changed.includes(key) && actual.fields[key] !== projection(project)[key])) {
      throw new Error('Итоги операций в CRM и проекте расходятся. Проверьте оплаты, закупки и категории затрат.');
    }
    project.crmSync = { state: 'ok', dealId, contact: { name: actual.contact.name || '', details: [actual.contact.phone, actual.contact.email].filter(Boolean).join(' · ') }, at: new Date().toISOString(), local: projection(project), remote: actual.fields };
    return { dealId, fields: actual.fields, stageName: actual.stages.find((stage) => stage.id === actual.deal.stageId)?.name };
  } catch (error) {
    project.crmSync = { ...project.crmSync, state: 'pending', message: error.message || 'CRM временно недоступна.' };
    return null;
  }
}
