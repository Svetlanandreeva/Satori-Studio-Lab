from pathlib import Path

ROOT = Path('/tmp/satori-auto-crm')

# Replace Spanish user-facing phrases only. Avoid bare English words such as
# Dashboard/Pipeline/Deals because they are also part of component/type names.
REPLACEMENTS = {
    # Global / dashboard
    'Buscar contactos, deals...': 'Поиск клиентов и сделок...',
    'Resumen de tu pipeline de ventas': 'Обзор клиентов, сделок и воронки продаж',
    'Bienvenido a Auto-CRM': 'Добро пожаловать в SATORI CRM',
    'Tu CRM esta listo. Aqui tienes como comenzar:': 'CRM готова к работе.',
    '1. Personaliza tu CRM': '1. Настройте CRM',
    '2. Agrega contactos': '2. Добавьте клиентов',
    '3. Carga datos demo': '3. Добавьте данные',
    'Ejecuta': 'Используйте',
    'en Claude Code': 'при необходимости',
    'Ve a Contactos o usa': 'Откройте раздел «Клиенты»',
    'No hay deals en el pipeline': 'В воронке пока нет сделок',
    'No hay actividad reciente': 'Недавней активности пока нет',
    'Actividad reciente': 'Последняя активность',
    'Pipeline de Ventas': 'Воронка продаж',
    'Contactos totales': 'Всего клиентов',
    'Deals activos': 'Активные сделки',
    'Valor pipeline': 'Сумма в воронке',
    'Ventas ganadas': 'Завершённые продажи',
    'Conversion': 'Конверсия',
    'Leads calientes': 'Горячие лиды',

    # Contacts
    'Contactos': 'Клиенты',
    'Gestiona tus leads y prospectos': 'Клиенты, лиды и история взаимодействий',
    'Nuevo Contacto': 'Новый клиент',
    'Editar Contacto': 'Редактировать клиента',
    'Contacto actualizado': 'Клиент обновлён',
    'Contacto creado': 'Клиент создан',
    'Contacto eliminado': 'Клиент удалён',
    'Error al guardar el contacto': 'Не удалось сохранить клиента',
    'Error al eliminar el contacto': 'Не удалось удалить клиента',
    'Error al guardar': 'Ошибка сохранения',
    'Error al eliminar': 'Ошибка удаления',
    'Estas seguro de eliminar este contacto? Esta accion no se puede deshacer.': 'Удалить этого клиента? Это действие нельзя отменить.',
    'Volver a contactos': 'Назад к клиентам',
    'Informacion': 'Информация',
    'Editar': 'Изменить',
    'Eliminar': 'Удалить',
    'Copiado': 'Скопировано',
    'Error al copiar': 'Не удалось скопировать',
    'Copiar email': 'Скопировать email',
    'Copiar telefono': 'Скопировать телефон',
    'Abrir WhatsApp': 'Открыть WhatsApp',
    'Llamar': 'Позвонить',
    'Creado ': 'Создан ',
    'Score:': 'Оценка:',
    'Deals (': 'Сделки (',
    'Sin deals': 'Сделок пока нет',
    'Actividades (': 'Активность (',
    'Registrar': 'Добавить',
    'Sin actividades. Registra una llamada, email o nota.': 'Активности пока нет. Добавьте звонок, письмо или заметку.',
    'Completar': 'Завершить',
    'Actividad completada': 'Активность завершена',
    'Error al completar la actividad': 'Не удалось завершить активность',
    'No hay contactos': 'Клиентов пока нет',
    'Agrega tu primer contacto para comenzar a gestionar tu pipeline de ventas.': 'Добавьте первого клиента, чтобы начать работу с воронкой продаж.',
    'Agregar contacto': 'Добавить клиента',
    'Buscar por nombre, email o empresa...': 'Поиск по имени, email или компании...',
    'Todos': 'Все',
    'Caliente': 'Горячий',
    'Tibio': 'Тёплый',
    'Frio': 'Холодный',
    'Exportar': 'Экспорт',
    'Nombre': 'Имя',
    'Empresa': 'Компания',
    'Fuente': 'Источник',
    'Temperatura': 'Статус',
    'Fecha': 'Дата',
    'Sin email': 'Нет email',
    '{filtered.length} de {contacts.length} contactos': '{filtered.length} из {contacts.length} клиентов',

    # Contact form
    'El nombre es requerido': 'Укажите имя',
    'Email invalido': 'Некорректный email',
    'Nombre *': 'Имя *',
    'Nombre completo': 'Имя клиента',
    'Telefono': 'Телефон',
    '+52 55 1234 5678': '+7 999 123-45-67',
    'Nombre de la empresa': 'Название компании',
    'Sitio web': 'Сайт',
    'Referido': 'Рекомендация',
    'Redes sociales': 'Соцсети',
    'Llamada fria': 'Холодный звонок',
    'Formulario': 'Форма',
    'Evento': 'Мероприятие',
    'Importado': 'Импорт',
    'Otro': 'Другое',
    'Notas': 'Заметки',
    'Notas sobre el contacto...': 'Заметки о клиенте...',
    'Cancelar': 'Отмена',
    'Guardando...': 'Сохранение...',
    'Actualizar': 'Сохранить',
    'Crear': 'Создать',

    # Deals
    'No hay deals': 'Сделок пока нет',
    'Crea tu primer deal para comenzar a gestionar tu pipeline.': 'Создайте первую сделку для работы с воронкой.',
    'Crear deal': 'Создать сделку',
    'Nuevo Deal': 'Новая сделка',
    'Editar Deal': 'Редактировать сделку',
    'Deal creado': 'Сделка создана',
    'Deal actualizado': 'Сделка обновлена',
    'Deal eliminado': 'Сделка удалена',
    'El titulo es requerido': 'Укажите название сделки',
    'Titulo': 'Название',
    'Valor': 'Сумма',
    'Contacto': 'Клиент',
    'Etapa': 'Этап',
    'Probabilidad': 'Вероятность',
    'Cierre esperado': 'Ожидаемое завершение',
    'Seleccionar contacto': 'Выберите клиента',
    'Seleccionar etapa': 'Выберите этап',
    'Sin fecha': 'Без даты',
    'No hay actividades registradas para este deal': 'По этой сделке пока нет активности',
    'Detalle del deal': 'Карточка сделки',
    'Volver a deals': 'Назад к сделкам',

    # Activities
    'Actividades': 'Активность',
    'No hay actividades': 'Активности пока нет',
    'Las actividades aparecen cuando registras llamadas, emails, reuniones o notas.': 'Здесь появятся звонки, письма, встречи и заметки.',
    'Nueva Actividad': 'Новая активность',
    'Registrar actividad': 'Добавить активность',
    'Tipo': 'Тип',
    'Descripcion': 'Описание',
    'Fecha programada': 'Запланировано на',
    'Llamada': 'Звонок',
    'Reunion': 'Встреча',
    'Nota': 'Заметка',
    'Seguimiento': 'Follow-up',
    'Pendiente': 'Запланировано',
    'Completada': 'Завершено',
    'Vencida': 'Просрочено',
    'Hoy': 'Сегодня',
    'Ayer': 'Вчера',
    'Proximos': 'Предстоящие',
    'Vencidos': 'Просроченные',
    'Hace ${diffDays} dias': '${diffDays} дн. назад',
    'Hace ${Math.floor(diffDays / 7)} semanas': '${Math.floor(diffDays / 7)} нед. назад',

    # Pipeline
    'Pipeline de ventas': 'Воронка продаж',
    'Arrastra los deals entre etapas para actualizar su estado': 'Перетаскивайте сделки между этапами',
    'Arrastra y suelta deals entre etapas': 'Перетаскивайте сделки между этапами',
    'Sin deals en esta etapa': 'На этом этапе сделок нет',

    # Settings / generic API feedback
    'Configuracion': 'Настройки',
    'Notificaciones': 'Уведомления',
    'Secret invalido o faltante': 'Неверный или отсутствующий секрет',
    'JSON invalido': 'Некорректный JSON',
    'No hay etapas de pipeline configuradas': 'Воронка не настроена',
    'No hay campos para actualizar': 'Нет полей для обновления',
    'Error al crear contacto': 'Не удалось создать клиента',
}

for path in ROOT.joinpath('src').rglob('*'):
    if path.suffix not in {'.ts', '.tsx'}:
        continue
    text = path.read_text(encoding='utf-8')
    original = text
    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding='utf-8')

# Translate the few English labels that also exist inside code identifiers by
# targeting their JSX/string context instead of replacing the bare word.
TARGETED = {
    'src/app/page.tsx': {
        '>Dashboard</h1>': '>Главная</h1>',
    },
    'src/app/pipeline/page.tsx': {
        '>Pipeline</h1>': '>Воронка</h1>',
    },
    'src/app/deals/page.tsx': {
        '>Deals</h1>': '>Сделки</h1>',
    },
}
for rel, mapping in TARGETED.items():
    path = ROOT / rel
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for old, new in mapping.items():
        text = text.replace(old, new)
    path.write_text(text, encoding='utf-8')

# Russian locale/currency and Need Number source are structural changes rather than translations.
types = ROOT / 'src/types/index.ts'
text = types.read_text(encoding='utf-8')
if '| "need_number"' not in text:
    text = text.replace('  | "webhook"\n  | "otro";', '  | "webhook"\n  | "need_number"\n  | "otro";')
text = text.replace('language: "es" | "en";', 'language: "ru" | "es" | "en";')
types.write_text(text, encoding='utf-8')

constants = ROOT / 'src/lib/constants.ts'
text = constants.read_text(encoding='utf-8')
if 'need_number:' not in text:
    text = text.replace('  webhook: "Webhook",\n  otro:', '  webhook: "Webhook",\n  need_number: "Need Number",\n  otro:')
text = text.replace('new Intl.NumberFormat("es-MX"', 'new Intl.NumberFormat("ru-RU"')
text = text.replace('currency: "MXN"', 'currency: "RUB"')
text = text.replace('new Intl.DateTimeFormat("es-MX"', 'new Intl.DateTimeFormat("ru-RU"')
constants.write_text(text, encoding='utf-8')

# Satori language preference for the settings screen.
config = ROOT / 'public/crm-config.json'
if config.exists():
    text = config.read_text(encoding='utf-8').replace('"language": "es"', '"language": "ru"')
    config.write_text(text, encoding='utf-8')

print('Russian localization applied without touching code identifiers')
