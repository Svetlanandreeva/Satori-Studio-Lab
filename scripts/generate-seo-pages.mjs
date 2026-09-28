import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const rootFile = path.join(dist, "index.html");
if (!fs.existsSync(rootFile)) process.exit(0);

const template = fs.readFileSync(rootFile, "utf8");

const pages = {
  catalog: {
    title: "Авторские светильники, декор и предметы интерьера | SATORI",
    description: "Каталог SATORI: авторские светильники, декор, украшения и интерьерные объекты. Ручная работа, небольшие серии и доставка по России.",
  },
  limited: {
    title: "Лимитированные предметы интерьера | SATORI",
    description: "Лимитированные серии SATORI: свет, декор и коллекционные интерьерные объекты небольшими тиражами.",
  },
  custom: {
    title: "Мебель и предметы интерьера на заказ | SATORI",
    description: "Создадим мебель, свет, декор или интерьерный объект под ваш проект. Материалы, размеры, цвет и отделка под задачу; производство в России и Китае.",
  },
  designers: {
    title: "Дизайнерам и архитекторам — производство и комплектация | SATORI",
    description: "SATORI для дизайнеров и архитекторов: подбор по референсу, адаптация и производство мебели, света, декора и нестандартных интерьерных объектов в России и Китае.",
  },
  business: {
    title: "Мебель и интерьерные объекты для бизнеса | SATORI",
    description: "SATORI для дизайнеров и бизнеса: мебель, свет, декор, комплектация и индивидуальные тиражи. Производство и фабрики в России и Китае.",
  },
  about: {
    title: "О студии предметного дизайна SATORI",
    description: "SATORI — студия предметного дизайна и интерьерных объектов. Создаём авторский свет, декор, мебель и изделия под проект.",
  },
  faq: {
    title: "Вопросы об изготовлении и заказе | SATORI",
    description: "Ответы SATORI о материалах, индивидуальном изготовлении, сроках, оплате, доставке и уходе за интерьерными объектами.",
  },
  delivery: {
    title: "Оплата и доставка | SATORI",
    description: "Условия оплаты и доставки заказов SATORI по Екатеринбургу и России: способы доставки, сроки и получение заказа.",
  },
};

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function replaceMeta(html, route, page) {
  const canonical = `https://satorilabural.ru/${route}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${description}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${canonical}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${title}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${description}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/i, `<meta property="og:url" content="${canonical}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/i, `<meta name="twitter:title" content="${title}" />`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/i, `<meta name="twitter:description" content="${description}" />`);
  return html;
}

for (const [route, page] of Object.entries(pages)) {
  const dir = path.join(dist, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), replaceMeta(template, route, page));
}

console.log(`Generated ${Object.keys(pages).length} SEO entry pages`);
