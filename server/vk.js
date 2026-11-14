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

export async function sendVkMessage(handle, message) {
  const token = process.env.VK_GROUP_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  if (!token || !groupId) throw new Error("Настройте VK_GROUP_TOKEN и VK_GROUP_ID");

  const userId = await resolveUserId(handle, token);
  const messageId = await callVk("messages.send", token, {
    user_id: String(userId),
    message,
    group_id: groupId,
    random_id: String(Math.floor(Math.random() * (2 ** 31 - 1)) + 1),
  });
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("VK не подтвердил отправку сообщения");
  }
  return messageId;
}
