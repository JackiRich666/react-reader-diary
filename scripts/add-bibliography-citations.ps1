param(
    [string]$DocumentPath = "Пояснительная записка.docx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Normalize-Text {
    param([string]$Text)

    if ($null -eq $Text) {
        return ""
    }

    return ([regex]::Replace($Text, "\s+", " ")).Trim()
}

function Get-ParagraphText {
    param(
        [System.Xml.XmlElement]$Paragraph,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    $textNodes = $Paragraph.SelectNodes(".//w:t", $NamespaceManager)
    return (($textNodes | ForEach-Object { $_.InnerText }) -join "")
}

function Set-ParagraphText {
    param(
        [System.Xml.XmlElement]$Paragraph,
        [string]$Text,
        [xml]$DocumentXml,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    $wordNs = $NamespaceManager.LookupNamespace("w")
    $xmlNs = "http://www.w3.org/XML/1998/namespace"
    $firstRun = $Paragraph.SelectSingleNode("./w:r", $NamespaceManager)

    if ($null -eq $firstRun) {
        $firstRun = $DocumentXml.CreateElement("w", "r", $wordNs)
        [void]$Paragraph.AppendChild($firstRun)
    }

    foreach ($child in @($firstRun.ChildNodes)) {
        if ($child.LocalName -ne "rPr") {
            [void]$firstRun.RemoveChild($child)
        }
    }

    $textNode = $DocumentXml.CreateElement("w", "t", $wordNs)
    $space = $DocumentXml.CreateAttribute("xml", "space", $xmlNs)
    $space.Value = "preserve"
    [void]$textNode.Attributes.Append($space)
    $textNode.InnerText = $Text
    [void]$firstRun.AppendChild($textNode)

    foreach ($child in @($Paragraph.ChildNodes)) {
        if ($child -ne $firstRun -and $child.LocalName -ne "pPr") {
            [void]$Paragraph.RemoveChild($child)
        }
    }
}

function Find-ParagraphByPrefix {
    param(
        [System.Collections.Generic.List[System.Xml.XmlElement]]$Paragraphs,
        [System.Xml.XmlNamespaceManager]$NamespaceManager,
        [string]$Prefix
    )

    $needle = Normalize-Text $Prefix

    foreach ($paragraph in $Paragraphs) {
        $text = Normalize-Text (Get-ParagraphText $paragraph $NamespaceManager)
        if ($text.StartsWith($needle, [System.StringComparison]::Ordinal)) {
            return $paragraph
        }
    }

    throw "Не удалось найти абзац по префиксу: $Prefix"
}

function Add-CitationToText {
    param(
        [string]$Text,
        [string]$Citation
    )

    $trimmed = $Text.TrimEnd()

    if ($trimmed.Contains($Citation)) {
        return $Text
    }

    if ($trimmed.EndsWith(".")) {
        return ($trimmed.Substring(0, $trimmed.Length - 1) + " $Citation.")
    }

    return "$trimmed $Citation"
}

$resolvedDocumentPath = (Resolve-Path $DocumentPath).Path
$backupPath = [System.IO.Path]::Combine(
    [System.IO.Path]::GetDirectoryName($resolvedDocumentPath),
    ([System.IO.Path]::GetFileNameWithoutExtension($resolvedDocumentPath) + "_citations_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".docx")
)

Copy-Item -LiteralPath $resolvedDocumentPath -Destination $backupPath

$workingDirectory = Join-Path (Split-Path -Parent $resolvedDocumentPath) (".docx-citations-" + [guid]::NewGuid().ToString("N"))
$contentDirectory = Join-Path $workingDirectory "content"
[System.IO.Directory]::CreateDirectory($contentDirectory) | Out-Null

try {
    $zipPath = Join-Path $workingDirectory "document.zip"
    Copy-Item -LiteralPath $resolvedDocumentPath -Destination $zipPath
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $contentDirectory)

    $documentXmlPath = Join-Path $contentDirectory "word\document.xml"
    [xml]$documentXml = Get-Content -LiteralPath $documentXmlPath -Encoding utf8
    $namespaceManager = New-Object System.Xml.XmlNamespaceManager($documentXml.NameTable)
    $namespaceManager.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

    $paragraphNodes = $documentXml.SelectNodes("//w:body/w:p", $namespaceManager)
    $paragraphs = New-Object "System.Collections.Generic.List[System.Xml.XmlElement]"
    foreach ($paragraph in $paragraphNodes) {
        [void]$paragraphs.Add([System.Xml.XmlElement]$paragraph)
    }

    $targets = @(
        @{ Prefix = "Разрабатываемое веб-приложение Reader Diary относится к классу сервисных информационных порталов"; Citation = "[9]" },
        @{ Prefix = "Техническое задание на разработку веб-приложения Reader Diary составлено"; Citation = "[1]" },
        @{ Prefix = "Приложение взаимодействует с пользователями через веб-браузер"; Citation = "[2, 3, 4]" },
        @{ Prefix = "Для реализации веб-приложения Reader Diary выбран язык программирования JavaScript"; Citation = "[8]" },
        @{ Prefix = "На клиентской стороне в качестве основной библиотеки выбрана React 18"; Citation = "[2, 8]" },
        @{ Prefix = "Для сборки и разработки клиентской части используется Vite"; Citation = "[2]" },
        @{ Prefix = "На серверной стороне используется Node.js"; Citation = "[3]" },
        @{ Prefix = "Проект реализован как монорепозиторий с двумя рабочими пространствами"; Citation = "[2, 3, 4, 5, 6, 7]" },
        @{ Prefix = "React 18 + React Router DOM – маршрутизация страниц"; Citation = "[2]" },
        @{ Prefix = "Recharts – построение интерактивных графиков статистики чтения"; Citation = "[6]" },
        @{ Prefix = "Context API – управление состоянием авторизации и токеном"; Citation = "[2]" },
        @{ Prefix = "Express – создание REST API"; Citation = "[3]" },
        @{ Prefix = "jsonwebtoken – генерация и проверка JWT-токенов для авторизации"; Citation = "[3]" },
        @{ Prefix = "bcryptjs – безопасное хэширование паролей"; Citation = "[5]" },
        @{ Prefix = "better-sqlite3 – работа с базой данных"; Citation = "[4, 5]" },
        @{ Prefix = "pdfkit – генерация PDF-файлов при экспорте"; Citation = "[7]" },
        @{ Prefix = "SQLite – встраиваемая СУБД"; Citation = "[4]" },
        @{ Prefix = "Веб-приложение Reader Diary реализовано по клиент-серверной модели"; Citation = "[2, 3, 4, 5]" },
        @{ Prefix = "Пользователь взаимодействует с приложением через браузер"; Citation = "[2, 3]" },
        @{ Prefix = "Клиентская часть обращается к серверу по HTTP через REST API"; Citation = "[3]" },
        @{ Prefix = "После входа React-клиент запрашивает агрегированные данные панели управления"; Citation = "[3, 4, 5]" },
        @{ Prefix = "Дизайн-макет выполнен в едином стиле light warm"; Citation = "[8]" },
        @{ Prefix = "Клиентская часть приложения реализована на React с использованием функциональных компонентов и механизма хуков"; Citation = "[2, 8]" },
        @{ Prefix = "Состояние аутентификации инкапсулировано в AuthContext"; Citation = "[2]" },
        @{ Prefix = "Интерфейс панели управления декомпозирован на самостоятельные компоненты"; Citation = "[2, 6]" },
        @{ Prefix = "Для обмена данными используется общий модуль apiRequest"; Citation = "[2, 3]" },
        @{ Prefix = "Серверная часть организована на Express и разделена на конфигурационный уровень"; Citation = "[3, 4, 5]" },
        @{ Prefix = "Маршруты работают совместно с middleware авторизации"; Citation = "[3, 5]" },
        @{ Prefix = "Бизнес-логика вынесена в сервисные модули"; Citation = "[4, 5, 6, 7]" },
        @{ Prefix = "Ключевые пользовательские действия обрабатываются на сервере по единым правилам предметной области"; Citation = "[3, 4, 5]" },
        @{ Prefix = "Отдельный контур реализован для экспорта материалов"; Citation = "[7]" },
        @{ Prefix = "Важной частью технической реализации являются защитные механизмы"; Citation = "[3, 5]" },
        @{ Prefix = "В качестве системы управления базами данных выбрана SQLite с использованием драйвера better-sqlite3"; Citation = "[4, 5]" },
        @{ Prefix = "Отсутствие отдельного сервера БД. SQLite – встраиваемая СУБД"; Citation = "[4]" },
        @{ Prefix = "Высокая производительность для учебного и небольшого многопользовательского сценария"; Citation = "[4, 5]" },
        @{ Prefix = "Все интерфейсные элементы построены как независимые компоненты"; Citation = "[2, 6]" },
        @{ Prefix = "StatsGrid – сетка сводных показателей"; Citation = "[2]" },
        @{ Prefix = "ChartsPanel – два графика на Recharts"; Citation = "[6]" },
        @{ Prefix = "ExportPreviewModal – модальное окно с выбором формата"; Citation = "[7]" },
        @{ Prefix = "Главный DashboardPage загружает все данные одним запросом"; Citation = "[2, 3]" },
        @{ Prefix = "authRoutes.js – регистрация, вход, получение текущего пользователя."; Citation = "[3, 5]" },
        @{ Prefix = "libraryRoutes.js – все операции с книгами, сеансами, заметками и экспортом."; Citation = "[3, 4, 5, 7]" },
        @{ Prefix = "services/ – бизнес-логика:"; Citation = "[4, 5, 6, 7]" },
        @{ Prefix = "Автоматический прогресс:"; Citation = "[3, 4, 5]" },
        @{ Prefix = "Экспорт:"; Citation = "[7]" },
        @{ Prefix = "Техническая реализация веб-приложения Reader Diary выполнена как полноценное full-stack решение"; Citation = "[2, 3, 4, 5, 6, 7, 8]" },
        @{ Prefix = "Клиентская часть Клиентская часть разработана на библиотеке React 18 с использованием современного сборщика Vite"; Citation = "[2, 8]" },
        @{ Prefix = "Маршрутизация реализована с помощью React Router DOM v6."; Citation = "[2]" },
        @{ Prefix = "Управление состоянием авторизации и данными пользователя осуществляется через React Context API."; Citation = "[2]" },
        @{ Prefix = "Все запросы к серверу выполняются с помощью библиотеки Axios"; Citation = "[3]" },
        @{ Prefix = "Для визуализации статистики используются графики на базе библиотеки Recharts"; Citation = "[6]" },
        @{ Prefix = "Стилизация выполнена с помощью CSS-модулей с поддержкой адаптивной вёрстки"; Citation = "[8]" },
        @{ Prefix = "Серверная часть Серверная часть построена на платформе Node.js с использованием фреймворка Express.js."; Citation = "[3]" },
        @{ Prefix = "Авторизация и защита маршрутов реализована через JSON Web Tokens (JWT)."; Citation = "[3, 5]" },
        @{ Prefix = "Все маршруты разделены на логические модули: authRoutes.js"; Citation = "[3, 4, 5, 7]" },
        @{ Prefix = "Бизнес-логика вынесена в отдельный слой services/"; Citation = "[4, 5, 6, 7]" },
        @{ Prefix = "Пересчёт прогресса чтения и автоматическое завершение книги при достижении 100% реализованы на стороне сервера"; Citation = "[3, 4, 5]" },
        @{ Prefix = "Взаимодействие клиентской и серверной частей Взаимодействие осуществляется через RESTful API с обменом данными в формате JSON."; Citation = "[3, 4, 5]" },
        @{ Prefix = "Генерация PDF-файлов при экспорте осуществляется библиотекой pdfkit с поддержкой русского языка"; Citation = "[7]" },
        @{ Prefix = "Полная изоляция данных пользователей на уровне сервера по полю user_id"; Citation = "[4, 5]" },
        @{ Prefix = "В production-режиме собранная сборка React (папка client/dist) отдаётся Express-сервером как статические файлы"; Citation = "[2, 3]" },
        @{ Prefix = "Тестирование и отладка являются завершающим и обязательным этапом разработки веб-приложения Reader Diary"; Citation = "[1, 9]" },
        @{ Prefix = "Для обеспечения качества приложения использовались следующие виды тестирования"; Citation = "[1, 9]" },
        @{ Prefix = "Тестирование проводилось вручную"; Citation = "[1, 9]" },
        @{ Prefix = "Успешная регистрация нового пользователя"; Citation = "[3, 5]" },
        @{ Prefix = "Дополнительно протестирован сценарий упрощенного сброса пароля"; Citation = "[3, 5]" },
        @{ Prefix = "Также проверен защитный механизм ограничения неудачных попыток входа"; Citation = "[3, 5]" },
        @{ Prefix = "Экспорт по книге в форматах Markdown, JSON, TXT, PDF"; Citation = "[7]" },
        @{ Prefix = "Безопасность: данные разных пользователей полностью изолированы по user_id"; Citation = "[3, 5]" }
    )

    foreach ($target in $targets) {
        try {
            $paragraph = Find-ParagraphByPrefix -Paragraphs $paragraphs -NamespaceManager $namespaceManager -Prefix $target.Prefix
            $current = Get-ParagraphText $paragraph $namespaceManager
            $updated = Add-CitationToText -Text $current -Citation $target.Citation
            if ($updated -ne $current) {
                Set-ParagraphText -Paragraph $paragraph -Text $updated -DocumentXml $documentXml -NamespaceManager $namespaceManager
            }
        } catch {
            Write-Warning $_.Exception.Message
        }
    }

    $documentXml.Save($documentXmlPath)

    if (Test-Path -LiteralPath $resolvedDocumentPath) {
        Remove-Item -LiteralPath $resolvedDocumentPath -Force
    }

    [System.IO.Compression.ZipFile]::CreateFromDirectory($contentDirectory, $resolvedDocumentPath)

    Write-Output "Документ обновлен: $resolvedDocumentPath"
    Write-Output "Резервная копия: $backupPath"
}
finally {
    if (Test-Path -LiteralPath $workingDirectory) {
        Remove-Item -LiteralPath $workingDirectory -Recurse -Force
    }
}
