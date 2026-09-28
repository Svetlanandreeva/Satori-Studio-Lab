# Satori Studio Lab

Сайт-магазин Satori (`src/`, `server/`, `public/`) и CRM Satori (`crm-v2/`).

## CRM — crm.satorilabural.online

CRM собирается из MIT-проекта [Auto-CRM](https://github.com/Hainrixz/auto-crm) (зафиксированная версия)
плюс наши файлы из `crm-v2/overrides/src`, которые копируются поверх при сборке.

- Любое изменение в `crm-v2/**`, отправленное в `main`, автоматически собирается и выкатывается
  workflow **Deploy CRM v2 stage** (перед выкладкой делается копия базы в
  `/var/lib/satori-auto-crm/deploy-backups`, хранятся последние 10).
- База SQLite лежит вне папки приложения (`/var/lib/satori-auto-crm/crm.db`) и деплоем не затирается.

## Магазин

Деплой магазина — только вручную: Actions → **Deploy** → Run workflow.

## Правило

Не заменять CRM целиком на новую систему в этом репозитории и на этом VPS: на том же сервере
работает магазин. Новые системы — только на отдельном сервере.
