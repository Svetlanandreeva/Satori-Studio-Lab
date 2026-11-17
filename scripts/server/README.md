# Как код попадает на сервер

Сайт живёт на VPS 91.229.11.198 (Рег.облако). GitHub Actions на сервер **не заходят** —
сервер сам каждые 2 минуты забирает ветку `main` (таймер `satori-promo-sync`) и раскладывает:

| Папка в репозитории | Куда на сервере | Что происходит |
|---|---|---|
| `promo/` | `/var/www/satori/promo` | сайт, сразу |
| `server/` | `/var/www/satori/backend` | API, перезапуск `satori-backend`, откат если не стартовал |
| `src/` и `package*.json` | `/var/www/satori/frontend` | сборка админки `/admin` на сервере, 2–5 минут; при ошибке остаётся прежняя версия |
| `crm/` | `/var/www/satori/crm` | CRM, перезапуск `satori-crm` |

Скрипт установки таймера — `satori-full-sync.sh` (запускается один раз от root, повторный запуск безопасен).
Журналы: `/tmp/satori-frontend-build.log`, `/tmp/satori-npm.log`, `journalctl -u satori-promo-sync`.

Workflow-файлы, которые деплоят по SSH на `194.226.97.103`, смотрят на старый сервер и не работают.
