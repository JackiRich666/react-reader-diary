# Развертывание на VPS

## Подход

Простой production-вариант для учебного проекта:

- React собирается в статические файлы;
- Express отдает и API, и собранный клиент;
- приложение работает одним Node.js процессом;
- доступ снаружи идет по `http://SERVER_IP:4000`.

## Что нужно на сервере

- Ubuntu 22.04;
- открытый порт `4000/tcp`;
- установленный Node.js `22.x`;
- директория проекта, например `/opt/reader-diary`.

## Переменные окружения

Пример:

```bash
PORT=4000
JWT_SECRET=your-secret
DB_PATH=/opt/reader-diary/server/data/reader-diary.db
```

## Команды на сервере

```bash
npm install
npm run build
node --input-type=module -e "import('./server/src/db/initDatabase.js').then(m => m.initDatabase())"
npm run start:prod
```

## Для systemd

Пример `reader-diary.service`:

```ini
[Unit]
Description=Reader Diary
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/reader-diary
Environment=PORT=4000
Environment=JWT_SECRET=your-secret
ExecStart=/usr/bin/npm run start:prod
Restart=always

[Install]
WantedBy=multi-user.target
```
