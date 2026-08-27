const API_BASE = "https://api.vk.com/method";
const API_VERSION = "5.199";

function extractScreenName(handle) {
  const trimmed = handle.trim().replace(/^@/, "");
  const match = trimmed.match(/vk\.(?:com|ru)\/([a-zA-Z0-9_.]+)/);
  return match ? match[1] : trimmed;
}

async function resolveUserId(handle) {
  const screenName = extractScreenName(handle);
  const params = new URLSearchParams({
    screen_name: screenName,
    access_token: process.env.VK_GROUP_TOKEN,
    v: API_VERSION,
  });
  const res = await fetch(`${API_BASE}/utils.resolveScreenName?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.error_msg || "Не удалось найти профиль VK");
  if (!data.response || data.response.type !== "user") throw new Error("Ссылка не похожа на профиль пользователя VK");
  return data.response.object_id;
}

export async function sendVkMessage(handle, message) {
  const token = process.env.VK_GROUP_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  if (!token || !groupId) return; // фича не настроена — тихо ничего не делаем

  const userId = await resolveUserId(handle);
  const params = new URLSearchParams({
    user_id: String(userId),
    message,
    group_id: groupId,
    random_id: String(Math.floor(Math.random() * 2 ** 31)),
    access_token: token,
    v: API_VERSION,
  });
  const res = await fetch(`${API_BASE}/messages.send?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.error_msg || "Не удалось отправить сообщение VK");
  return data.response;
}
