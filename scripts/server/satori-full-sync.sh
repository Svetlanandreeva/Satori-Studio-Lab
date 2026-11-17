#!/usr/bin/env bash
# Автообновление САЙТА, АДМИНКИ (/admin) и CRM из GitHub. Запуск на сервере от root.
# После установки любая правка в репозитории (ветка main) приезжает на сервер за 1-2 минуты:
#   promo/   -> сайт
#   server/  -> API (с перезапуском и откатом, если новая версия не стартует)
#   src/     -> админка /admin (сборка на сервере; при ошибке остаётся прежняя версия)
#   crm/     -> CRM на crm.satorilabural.ru
set -euo pipefail

REPO="https://github.com/Svetlanandreeva/satori-studio-lab"
[ "$(id -u)" -eq 0 ] || { echo "Запустите от root"; exit 1; }

echo "== 1/5 Скрипт синхронизации"
cat > /usr/local/bin/satori-promo-sync <<SYNC
#!/usr/bin/env bash
set -euo pipefail
SRC=/opt/satori-promo-src
DST=/var/www/satori/promo
BACKEND=/var/www/satori/backend
STAMP=/var/lib/satori-sync-commit
cd /
exec 9>/run/satori-promo-sync.lock
flock -n 9 || exit 0

# Сломанную или недокачанную копию репозитория скачиваем заново
if ! git -C "\$SRC" rev-parse --verify -q HEAD >/dev/null 2>&1; then
  rm -rf "\$SRC"
  git clone -q --branch main "$REPO" "\$SRC"
else
  git -C "\$SRC" fetch -q origin main
  git -C "\$SRC" reset -q --hard FETCH_HEAD
fi
NEW=\$(git -C "\$SRC" rev-parse HEAD)
OLD=\$(cat "\$STAMP" 2>/dev/null || echo "")
[ "\$NEW" = "\$OLD" ] && exit 0

# ---------- САЙТ ----------
if [ -s "\$SRC/promo/index.html" ]; then
  mkdir -p "\$DST"
  rsync -a --delete --exclude 'README.md' "\$SRC/promo/" "\$DST/"
  chmod -R a+rX "\$DST"
else
  echo "В репозитории нет promo/index.html — сайт оставлен как есть"
fi

# ---------- BACKEND (API + админка) ----------
if [ -s "\$SRC/server/index.js" ]; then
  CHANGED=yes
  if [ -n "\$OLD" ]; then
    git -C "\$SRC" diff --quiet "\$OLD" "\$NEW" -- server package.json package-lock.json 2>/dev/null && CHANGED=no || CHANGED=yes
  fi
  if [ "\$CHANGED" = yes ]; then
    # зависимости — только если менялся package-lock.json или их ещё нет
    NEEDDEPS=no
    [ -d "\$SRC/node_modules" ] || NEEDDEPS=yes
    if [ -n "\$OLD" ]; then
      git -C "\$SRC" diff --quiet "\$OLD" "\$NEW" -- package-lock.json 2>/dev/null || NEEDDEPS=yes
    fi
    if [ "\$NEEDDEPS" = yes ]; then
      (cd "\$SRC" && npm ci --omit=dev --no-audit --no-fund >/tmp/satori-npm.log 2>&1) \\
        || (cd "\$SRC" && npm install --omit=dev --no-audit --no-fund >>/tmp/satori-npm.log 2>&1) || true
    fi
    # бэкап рабочей версии
    rm -rf "\$BACKEND.prev"
    cp -a "\$BACKEND" "\$BACKEND.prev" 2>/dev/null || true
    rsync -a --exclude 'data/' --exclude 'uploads/' --exclude 'node_modules/' "\$SRC/server/" "\$BACKEND/"
    # модули рядом с backend, чтобы node их нашёл
    [ -d "\$SRC/node_modules" ] && ln -sfn "\$SRC/node_modules" "\$BACKEND/node_modules"
    systemctl restart satori-backend || true
    sleep 4
    if ! curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3001/api/products; then
      echo "Новая версия backend не отвечает — откат на предыдущую"
      if [ -d "\$BACKEND.prev" ]; then
        rsync -a --delete --exclude 'data/' --exclude 'uploads/' "\$BACKEND.prev/" "\$BACKEND/"
        systemctl restart satori-backend || true
      fi
    fi
  fi
fi

# ---------- CRM ----------
if [ -s "\$SRC/crm/server.js" ]; then
  CRMCHANGED=yes
  if [ -n "\$OLD" ]; then
    git -C "\$SRC" diff --quiet "\$OLD" "\$NEW" -- crm server package.json 2>/dev/null && CRMCHANGED=no || CRMCHANGED=yes
  fi
  if [ "\$CRMCHANGED" = yes ]; then
    mkdir -p /var/www/satori/crm/data
    (cd "\$SRC/crm" && npm ci --omit=dev --no-audit --no-fund >>/tmp/satori-npm.log 2>&1) \\
      || (cd "\$SRC/crm" && npm install --omit=dev --no-audit --no-fund >>/tmp/satori-npm.log 2>&1) || true
    rsync -a --exclude 'data/' --exclude 'node_modules/' "\$SRC/crm/" /var/www/satori/crm/
    [ -d "\$SRC/crm/node_modules" ] && ln -sfn "\$SRC/crm/node_modules" /var/www/satori/crm/node_modules
    ln -sfn /var/www/satori/backend /var/www/satori/server
    systemctl restart satori-crm 2>/dev/null || true
  fi
fi

# ---------- АДМИНКА (/admin): сборка React из src/ ----------
FE=/var/www/satori/frontend
BUILD=/opt/satori-frontend-build
if [ -s "\$SRC/package.json" ] && [ -d "\$SRC/src" ]; then
  FECHANGED=yes
  if [ -n "\$OLD" ] && [ -s "\$FE/index.html" ]; then
    git -C "\$SRC" diff --quiet "\$OLD" "\$NEW" -- src public index.html vite.config.ts postcss.config.mjs scripts package.json package-lock.json 2>/dev/null && FECHANGED=no || FECHANGED=yes
  fi
  if [ "\$FECHANGED" = yes ]; then
    echo "Собираю админку (2-5 минут)..."
    mkdir -p "\$BUILD"
    rsync -a --delete --exclude 'node_modules/' --exclude '.git/' --exclude 'dist/' "\$SRC/" "\$BUILD/"
    if (cd "\$BUILD" && { npm ci --no-audit --no-fund || npm install --no-audit --no-fund; } \\
          && NODE_OPTIONS=--max-old-space-size=1536 nice -n 10 npm run build) >/tmp/satori-frontend-build.log 2>&1 \\
       && [ -s "\$BUILD/dist/index.html" ]; then
      mkdir -p "\$FE"
      # старые файлы не удаляем: у открытых вкладок ссылки на прежние assets
      rsync -a --exclude 'index.html' "\$BUILD/dist/" "\$FE/"
      cp "\$BUILD/dist/index.html" "\$FE/index.html"
      chmod -R a+rX "\$FE"
      echo "Админка обновлена: \$NEW"
    else
      echo "Сборка админки не прошла — оставлена прежняя версия. Журнал: /tmp/satori-frontend-build.log"
      tail -n 20 /tmp/satori-frontend-build.log || true
    fi
  fi
fi

echo "\$NEW" > "\$STAMP"
SYNC
chmod +x /usr/local/bin/satori-promo-sync

echo "== 1b/5 Сервис CRM и поддомен"
CRMDOMAIN="crm.satorilabural.ru"
mkdir -p /var/www/satori/crm/data
ln -sfn /var/www/satori/backend /var/www/satori/server
cat > /etc/systemd/system/satori-crm.service <<'UNIT'
[Unit]
Description=Satori CRM
After=network.target satori-backend.service

[Service]
Type=simple
WorkingDirectory=/var/www/satori/crm
ExecStart=/usr/bin/node /var/www/satori/crm/start.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=CRM_PORT=3010

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable satori-crm >/dev/null 2>&1

if [ ! -f /etc/nginx/sites-available/satori-crm ]; then
  cat > /etc/nginx/sites-available/satori-crm <<NGINXCRM
server {
    listen 80;
    server_name $CRMDOMAIN;
    client_max_body_size 32m;
    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXCRM
  ln -sfn /etc/nginx/sites-available/satori-crm /etc/nginx/sites-enabled/satori-crm
  nginx -t 2>/dev/null && systemctl reload nginx || { rm -f /etc/nginx/sites-enabled/satori-crm; systemctl reload nginx; echo "nginx не принял конфиг CRM"; }
fi

echo "== 2/5 Таймер (каждые 2 минуты)"
cat > /etc/systemd/system/satori-promo-sync.service <<'UNIT'
[Unit]
Description=Sync Satori site and backend from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
TimeoutStartSec=900
ExecStart=/usr/local/bin/satori-promo-sync
UNIT
cat > /etc/systemd/system/satori-promo-sync.timer <<'UNIT'
[Unit]
Description=Sync Satori site and backend from GitHub every 2 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
AccuracySec=15s

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable satori-promo-sync.timer >/dev/null 2>&1
systemctl restart satori-promo-sync.timer

echo "== 3/5 Кэш: стили и скрипты всегда свежие"
CONF=/etc/nginx/sites-available/satori
if grep -q 'expires 7d;' "$CONF"; then
  cp "$CONF" "$CONF.bak-$(date +%F-%H%M)"
  sed -i 's|        expires 7d;|        add_header Cache-Control "no-cache";|' "$CONF"
  nginx -t 2>/dev/null && systemctl reload nginx || cp "$(ls -t "$CONF".bak-* | head -1)" "$CONF"
fi

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 4/5 Первая синхронизация (5-10 минут: ставятся зависимости и собирается админка)"
rm -f /var/lib/satori-sync-commit
systemctl start satori-promo-sync.service || true

echo "== 5/5 Проверка"
echo "Версия с GitHub: $(git -C /opt/satori-promo-src log -1 --format='%h %s' 2>/dev/null | cut -c1-70)"
systemctl is-active satori-backend | sed 's/^/backend: /'
curl -fsS -o /dev/null -w "Сайт:            HTTP %{http_code}\n" http://127.0.0.1/ -H 'Host: satorilabural.ru' || true
curl -fsS -o /dev/null -w "Страница /adm:   HTTP %{http_code}\n" http://127.0.0.1/adm -H 'Host: satorilabural.ru' || true
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/admin/portfolio -H 'Authorization: Bearer x')
systemctl restart satori-crm 2>/dev/null || true
sleep 3
crmcode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 http://127.0.0.1:3010/ || echo 000)
echo "CRM на 3010:     HTTP $crmcode  (200 = работает)"
if [ "$crmcode" != "200" ]; then journalctl -u satori-crm -n 12 --no-pager | tail -12; fi
if getent hosts "crm.satorilabural.ru" >/dev/null 2>&1; then
  certbot --nginx -d crm.satorilabural.ru --non-interactive --agree-tos -m studiosatori@yandex.com --redirect >/tmp/satori-certbot-crm.log 2>&1 \
    && echo "Сертификат для crm.satorilabural.ru выпущен" \
    || echo "Сертификат пока не выпущен (DNS пока не разошёлся). Запустите скрипт ещё раз позже."
else
  echo "DNS для crm.satorilabural.ru пока не отвечает — сертификат выпустим при следующем запуске."
fi
echo "API админки:     HTTP $code  (401 = работает и просит пароль, 404 = ещё старая версия)"
echo
if [ "$code" = "401" ]; then
  echo "ГОТОВО. Сайт, админка и CRM обновляются с GitHub за 1-2 минуты."
  echo "CRM: https://crm.satorilabural.ru"
  echo
  echo "Адрес админки: https://satorilabural.ru/adm"
  grep -h '^ADMIN_PASSWORD=' /var/www/satori/.env 2>/dev/null | sed 's/^ADMIN_PASSWORD=/Пароль входа: /' || true
else
  echo "Сайт обновляется, но API админки ещё не поднялся. Последние строки журнала:"
  journalctl -u satori-backend -n 15 --no-pager | tail -15
  tail -5 /tmp/satori-npm.log 2>/dev/null || true
fi
