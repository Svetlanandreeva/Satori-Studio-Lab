const API_BASE = "https://api.vk.com/method";
const API_VERSION = "5.199";

function extractScreenName(handle) {
  const trimmed = handle.trim().replace(/^@/, "");
  const match = trimmed.match(/vk\.(?:com|ru)\/([a-zA-Z0-9_.]+)/);
  return match ? match[1] : trimmed;
}

async function callVk(method, token, fields) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    body: new URLSearchParams({ ...fields, access_token: token, v: API_VERSION }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`VK ${method}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`VK ${method}: API error ${Number(data.error.error_code) || "unknown"}`);
  return data.response;
}

async function resolveUserId(handle, token) {
  const screenName = extractScreenName(handle);
  const numericId = screenName.match(/^(?:id)?([1-9]\d*)$/i);
  if (numericId) return numericId[1];

  const profile = await callVk("utils.resolveScreenName", token, { screen_name: screenName });
  if (profile?.type !== "user") throw new Error("Получатель VK должен быть профилем пользователя");
  return profile.object_id;
}

async function uploadMessagePhoto(token, userId, dataUrl) {
  // The public form compresses its reference to a JPEG data URL under 72 KB.
  const prefix = "data:image/jpeg;base64,";
  if (typeof dataUrl !== "string" || dataUrl.length > 72000 || !dataUrl.startsWith(prefix)) {
    throw new Error("Некорректный формат фото заявки");
  }
  const encoded = dataUrl.slice(prefix.length);
  const jpeg = Buffer.from(encoded, "base64");
  if (jpeg.toString("base64") !== encoded || jpeg[0] !== 0xff ||
      jpeg[1] !== 0xd8 || jpeg[2] !== 0xff ||
      jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9) {
    throw new Error("Не удалось прочитать JPEG заявки");
  }

  const upload = await callVk("photos.getMessagesUploadServer", token, { peer_id: userId });
  const uploadUrl = new URL(upload?.upload_url);
  if (uploadUrl.protocol !== "https:") throw new Error("VK вернул некорректный адрес загрузки");

  const body = new FormData();
  body.set("photo", new Blob([jpeg], { type: "image/jpeg" }), "reference.jpg");
  const res = await fetch(uploadUrl, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`VK photo upload: HTTP ${res.status}`);
  const { server, photo, hash } = await res.json();
  if (!server || typeof photo !== "string" || photo === "[]" || !hash) {
    throw new Error("VK не подтвердил загрузку фото");
  }
  const [saved] = await callVk("photos.saveMessagesPhoto", token, { server, photo, hash });
  if (!Number.isInteger(saved?.owner_id) || !Number.isInteger(saved?.id) || saved.id <= 0) {
    throw new Error("VK не вернул идентификатор фото");
  }
  return `photo${saved.owner_id}_${saved.id}${saved.access_key ? `_${saved.access_key}` : ""}`;
}

export async function sendVkMessage(handle, message, { referenceDataUrl, onPhotoError } = {}) {
  const token = process.env.VK_GROUP_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  if (!token || !groupId) throw new Error("Настройте VK_GROUP_TOKEN и VK_GROUP_ID");

  const userId = await resolveUserId(handle, token);
  let attachment;
  if (referenceDataUrl) {
    try {
      attachment = await uploadMessagePhoto(token, userId, referenceDataUrl);
    } catch (error) {
      if (!onPhotoError) throw error;
      onPhotoError(error);
      message += "\nФото не удалось прикрепить. Оригинал заявки с фото доступен в CRM.";
    }
  }
  const messageId = await callVk("messages.send", token, {
    user_id: String(userId),
    message,
    ...(attachment ? { attachment } : {}),
    group_id: groupId,
    random_id: String(Math.floor(Math.random() * (2 ** 31 - 1)) + 1),
  });
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("VK не подтвердил отправку сообщения");
  }
  return messageId;
}
