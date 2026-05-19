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

function Find-ParagraphByText {
    param(
        [System.Collections.Generic.List[System.Xml.XmlElement]]$Paragraphs,
        [System.Xml.XmlNamespaceManager]$NamespaceManager,
        [string]$TargetText
    )

    $target = Normalize-Text $TargetText

    foreach ($paragraph in $Paragraphs) {
        if ((Normalize-Text (Get-ParagraphText $paragraph $NamespaceManager)) -eq $target) {
            return $paragraph
        }
    }

    throw "Не удалось найти абзац: $TargetText"
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

function New-ParagraphClone {
    param(
        [System.Xml.XmlElement]$TemplateParagraph,
        [string]$Text,
        [xml]$DocumentXml,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    $newParagraph = [System.Xml.XmlElement]$TemplateParagraph.CloneNode($true)
    Set-ParagraphText -Paragraph $newParagraph -Text $Text -DocumentXml $DocumentXml -NamespaceManager $NamespaceManager
    return $newParagraph
}

function Get-ParagraphIndex {
    param(
        [System.Collections.Generic.List[System.Xml.XmlElement]]$Paragraphs,
        [System.Xml.XmlElement]$Paragraph
    )

    for ($i = 0; $i -lt $Paragraphs.Count; $i++) {
        if ([object]::ReferenceEquals($Paragraphs[$i], $Paragraph)) {
            return $i
        }
    }

    throw "Не удалось определить индекс абзаца."
}

function Replace-ParagraphRange {
    param(
        [System.Xml.XmlElement]$BodyNode,
        [System.Collections.Generic.List[System.Xml.XmlElement]]$Paragraphs,
        [System.Xml.XmlElement]$StartParagraph,
        [System.Xml.XmlElement]$EndParagraph,
        [string[]]$ReplacementTexts,
        [xml]$DocumentXml,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    $startIndex = Get-ParagraphIndex -Paragraphs $Paragraphs -Paragraph $StartParagraph
    $endIndex = Get-ParagraphIndex -Paragraphs $Paragraphs -Paragraph $EndParagraph

    if ($endIndex -le $startIndex) {
        throw "Неверный диапазон абзацев для замены."
    }

    $templateParagraph = $Paragraphs[$startIndex + 1]

    for ($i = $endIndex - 1; $i -gt $startIndex; $i--) {
        [void]$BodyNode.RemoveChild($Paragraphs[$i])
        $Paragraphs.RemoveAt($i)
    }

    $insertIndex = $startIndex + 1
    foreach ($text in $ReplacementTexts) {
        $newParagraph = New-ParagraphClone -TemplateParagraph $templateParagraph -Text $text -DocumentXml $DocumentXml -NamespaceManager $NamespaceManager
        [void]$BodyNode.InsertBefore($newParagraph, $EndParagraph)
        $Paragraphs.Insert($insertIndex, $newParagraph)
        $insertIndex++
    }
}

function Insert-ParagraphBefore {
    param(
        [System.Xml.XmlElement]$BodyNode,
        [System.Collections.Generic.List[System.Xml.XmlElement]]$Paragraphs,
        [System.Xml.XmlElement]$ReferenceParagraph,
        [System.Xml.XmlElement]$TemplateParagraph,
        [string]$Text,
        [xml]$DocumentXml,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    $newParagraph = New-ParagraphClone -TemplateParagraph $TemplateParagraph -Text $Text -DocumentXml $DocumentXml -NamespaceManager $NamespaceManager
    $referenceIndex = Get-ParagraphIndex -Paragraphs $Paragraphs -Paragraph $ReferenceParagraph
    [void]$BodyNode.InsertBefore($newParagraph, $ReferenceParagraph)
    $Paragraphs.Insert($referenceIndex, $newParagraph)
}

function Replace-Abbreviations {
    param(
        [System.Collections.Generic.List[System.Xml.XmlElement]]$Paragraphs,
        [xml]$DocumentXml,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    foreach ($paragraph in $Paragraphs) {
        $text = Get-ParagraphText $paragraph $NamespaceManager
        if ([string]::IsNullOrWhiteSpace($text)) {
            continue
        }

        $updated = $text
        $updated = [regex]::Replace($updated, "\bи др\.", "и другие")
        $updated = [regex]::Replace($updated, "\bт\.\s?к\.", "так как")
        $updated = [regex]::Replace($updated, "\bт\.\s?е\.", "то есть")
        $updated = [regex]::Replace($updated, "\bи т\.\s?д\.", "и так далее")
        $updated = [regex]::Replace($updated, "\bи т\.\s?п\.", "и тому подобное")

        if ($updated -ne $text) {
            Set-ParagraphText -Paragraph $paragraph -Text $updated -DocumentXml $DocumentXml -NamespaceManager $NamespaceManager
        }
    }
}

$resolvedDocumentPath = (Resolve-Path $DocumentPath).Path
$backupPath = [System.IO.Path]::Combine(
    [System.IO.Path]::GetDirectoryName($resolvedDocumentPath),
    ([System.IO.Path]::GetFileNameWithoutExtension($resolvedDocumentPath) + "_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".docx")
)

Copy-Item -LiteralPath $resolvedDocumentPath -Destination $backupPath

$workingDirectory = Join-Path (Split-Path -Parent $resolvedDocumentPath) (".docx-work-" + [guid]::NewGuid().ToString("N"))
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

    $bodyNode = $documentXml.SelectSingleNode("//w:body", $namespaceManager)
    $paragraphNodes = $documentXml.SelectNodes("//w:body/w:p", $namespaceManager)
    $paragraphs = New-Object "System.Collections.Generic.List[System.Xml.XmlElement]"
    foreach ($paragraph in $paragraphNodes) {
        [void]$paragraphs.Add([System.Xml.XmlElement]$paragraph)
    }

    $introHeading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "ВВЕДЕНИЕ"
    $chapter1Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "1 ОПИСАНИЕ ПРЕДМЕТНОЙ ОБЛАСТИ"
    $chapter2Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "2 ИНСТРУМЕНТАЛЬНЫЕ И ПРОГРАММНЫЕ СРЕДСТВА РАЗРАБОТКИ"
    $section24Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "2.4 Выбор веб-сервера"
    $section31Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "3.1 Структура веб-приложения"
    $section32Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "3.2 Разработка дизайн-макета веб-приложения"
    $section33Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "3.3 Разработка компонентов веб-приложения"
    $frontendHeading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "Клиентская часть (React)"
    $frontendFigureReference = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "На рисунке 4 изображен внешний вид модального окна предпросмотра содержимого экспорта."
    $serverHeading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "Серверная часть"
    $chapter4Heading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "4 ТЕСТИРОВАНИЕ И ОТЛАДКА ВЕБ-ПРИЛОЖЕНИЯ"
    $conclusionHeading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "ЗАКЛЮЧЕНИЕ"
    $bibliographyHeading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ"
    $booksSectionHeading = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "Работа с книгами"
    $authFiguresReference = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "На рисунках 6 и 7 показаны успешный процессы регистрации и входа в систему."
    $securityParagraph = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "Безопасность: данные разных пользователей полностью изолированы по user_id. Попытки доступа без токена или к чужим данным возвращают ошибку 401/403. Пароли хранятся только в хэшированном виде."
    $securityFigureReference = Find-ParagraphByText -Paragraphs $paragraphs -NamespaceManager $namespaceManager -TargetText "На рисунке 11 показана проверка изоляции данных двух разных пользователей."

    $introParagraphs = @(
        "В условиях цифровизации учебной и повседневной деятельности возрастает потребность в веб-приложениях, обеспечивающих персонализированный учет информации и удобный доступ к ней с различных устройств. Одной из таких задач является организация читательского дневника, позволяющего фиксировать список книг, ход чтения, заметки, цитаты и статистику пользовательской активности.",
        "Традиционные способы ведения читательских записей в бумажном виде или в несвязанных между собой электронных файлах затрудняют накопление, поиск и анализ данных. Пользователь не получает целостной картины собственного прогресса, не может быстро экспортировать материалы, сравнивать периоды активности и формировать рекомендации на основе уже прочитанных произведений.",
        "Для решения указанных проблем разработано веб-приложение ReaderDiary, реализованное на основе клиент-серверной архитектуры. Система предоставляет регистрацию и аутентификацию пользователей, ведение персональной библиотеки, фиксацию сеансов чтения, хранение заметок и цитат, построение графиков, экспорт данных и подбор рекомендаций по истории чтения и пользовательским оценкам.",
        "Целью курсовой работы является разработка веб-приложения для учета и планирования чтения книг, обеспечивающего хранение пользовательских данных, визуализацию прогресса чтения и доступ к основным функциям как с персонального компьютера, так и с мобильных устройств.",
        "Для достижения поставленной цели были решены следующие задачи: выполнен анализ предметной области и сформировано техническое задание; выбраны средства реализации клиентской и серверной частей приложения; спроектирована структура базы данных SQLite; реализованы механизмы регистрации, входа, сброса пароля, ведения библиотеки, учета сеансов чтения, экспорта и рекомендаций; проведены тестирование и апробация системы в локальной среде и на VPS-сервере.",
        "Объектом исследования является процесс цифрового ведения читательского дневника, а предметом исследования выступают методы и средства проектирования веб-приложения для учета книг, заметок, статистики чтения и пользовательских действий."
    )

    Replace-ParagraphRange -BodyNode $bodyNode -Paragraphs $paragraphs -StartParagraph $introHeading -EndParagraph $chapter1Heading -ReplacementTexts $introParagraphs -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $chapter1ConclusionText = "Таким образом, анализ предметной области, классификация веб-ресурсов и формализация требований показали, что разрабатываемая система относится к классу сервисных веб-приложений с персонализированным доступом к данным. Сформированное техническое задание определяет состав функций, ограничения и требования к качеству реализации и служит основой для последующего проектирования и программной разработки."
    $chapter1TemplateIndex = (Get-ParagraphIndex -Paragraphs $paragraphs -Paragraph $chapter2Heading) - 1
    Insert-ParagraphBefore -BodyNode $bodyNode -Paragraphs $paragraphs -ReferenceParagraph $chapter2Heading -TemplateParagraph $paragraphs[$chapter1TemplateIndex] -Text $chapter1ConclusionText -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $section23ConclusionText = "Следовательно, использование SQLite в рамках данного учебного проекта является обоснованным, поскольку выбранная СУБД обеспечивает простоту развертывания, достаточную производительность и удобство сопровождения. Возможности SQLite полностью покрывают требования к хранению пользовательских данных, статистики чтения, заметок и служебной информации приложения."
    $section23TemplateIndex = (Get-ParagraphIndex -Paragraphs $paragraphs -Paragraph $section24Heading) - 1
    Insert-ParagraphBefore -BodyNode $bodyNode -Paragraphs $paragraphs -ReferenceParagraph $section24Heading -TemplateParagraph $paragraphs[$section23TemplateIndex] -Text $section23ConclusionText -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $section31Paragraphs = @(
        "Веб-приложение ReaderDiary реализовано по клиент-серверной модели и включает три ключевых уровня: интерфейс пользователя на React, сервер приложений на Node.js и Express, а также базу данных SQLite. Такое разделение позволяет изолировать представление данных, бизнес-логику и слой хранения, что упрощает сопровождение и развитие системы.",
        "Пользователь взаимодействует с приложением через браузер. После открытия адреса загружается одностраничный клиент, собранный с помощью Vite. React-маршрутизация разделяет сценарии входа, регистрации, сброса пароля и работы с личным кабинетом читателя, а защищенные маршруты становятся доступны только после успешной аутентификации.",
        "Клиентская часть обращается к серверу по HTTP через REST API. При регистрации и входе используются маршруты /api/auth/register, /api/auth/login и /api/auth/me, а после авторизации токен сохраняется в локальном хранилище браузера и автоматически передается в заголовке Authorization для последующих запросов.",
        "После входа React-клиент запрашивает агрегированные данные панели управления по маршруту /api/library/dashboard. Сервер выполняет проверку JWT-токена, определяет идентификатор пользователя, извлекает сведения о библиотеке, статистике, недавней активности, заметках и рекомендациях, а затем возвращает единый JSON-объект, который используется для первичного заполнения интерфейса.",
        "Добавление книг, обновление статусов, сохранение сеансов чтения, заметок, цитат и экспорт материалов выполняются отдельными POST-, PUT- и GET-запросами. Серверная часть обрабатывает входные данные, применяет правила предметной области, например автоматическую установку прогресса в 100 процентов для книг со статусом «Прочитано», фиксирует изменения в SQLite и возвращает актуализированные данные клиенту.",
        "Для уменьшения связности фронтенд не работает с базой данных напрямую. Все действия пользователя проходят через серверный слой, где сосредоточены аутентификация, проверка корректности данных, формирование рекомендаций, подготовка файлов экспорта и защитные механизмы, включая ограничение неудачных попыток входа и упрощенный сброс пароля по логину пользователя."
    )

    Replace-ParagraphRange -BodyNode $bodyNode -Paragraphs $paragraphs -StartParagraph $section31Heading -EndParagraph $section32Heading -ReplacementTexts $section31Paragraphs -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $section32DescriptionParagraph = "Для детализации структуры экранов дополнительно подготовлены макеты страниц входа, регистрации, сброса пароля, основной панели управления и окна предпросмотра экспорта. В макетах отражены конкретные компоненты интерфейса: навигационный блок, формы ввода, карточки статистики, графические панели, список книг, блок рекомендаций и средства экспорта данных."
    $section32TemplateIndex = (Get-ParagraphIndex -Paragraphs $paragraphs -Paragraph $section33Heading) - 1
    Insert-ParagraphBefore -BodyNode $bodyNode -Paragraphs $paragraphs -ReferenceParagraph $section33Heading -TemplateParagraph $paragraphs[$section32TemplateIndex] -Text $section32DescriptionParagraph -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $frontendParagraphs = @(
        "Клиентская часть приложения реализована на React с использованием функциональных компонентов и механизма хуков. Базовая маршрутизация построена на основе react-router-dom: отдельные маршруты выделены для входа, регистрации и сброса пароля, а доступ к основной панели ограничивается компонентом защиты маршрута, проверяющим наличие корректной пользовательской сессии.",
        "Состояние аутентификации инкапсулировано в AuthContext. Данный контекст хранит текущие данные пользователя, JWT-токен, признак инициализации сессии и предоставляет методы login, register, logout и восстановление состояния после перезагрузки страницы. Благодаря этому любой дочерний компонент может получить сведения о пользователе без передачи параметров по длинной цепочке вложенности.",
        "Страница DashboardPage выполняет центральную координирующую роль. После загрузки она запрашивает данные по маршруту /api/library/dashboard, сохраняет их в локальном состоянии и передает дочерним компонентам только необходимую часть структуры. Такой подход уменьшает количество сетевых запросов и упрощает согласованное обновление интерфейса после пользовательских действий.",
        "Интерфейс панели управления декомпозирован на самостоятельные компоненты: StatsGrid отображает сводные показатели, ChartsPanel формирует диаграммы страниц в день и книг в год, BookList выводит пользовательскую библиотеку и команды экспорта, BookForm отвечает за добавление книг, SessionForm фиксирует сеансы чтения, EntryForm сохраняет заметки и цитаты, Recommendations выводит персональные рекомендации, а ExportPreviewModal показывает содержимое файлов до скачивания.",
        "Для обмена данными используется общий модуль apiRequest, инкапсулирующий работу с fetch, передачу заголовков авторизации, обработку JSON-ответов и сообщений об ошибках. Это исключает дублирование сетевого кода и обеспечивает единообразное поведение клиентской части при обращении к серверу."
    )

    Replace-ParagraphRange -BodyNode $bodyNode -Paragraphs $paragraphs -StartParagraph $frontendHeading -EndParagraph $frontendFigureReference -ReplacementTexts $frontendParagraphs -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $serverParagraphs = @(
        "Серверная часть организована на Express и разделена на конфигурационный уровень, маршруты, сервисы и модуль инициализации базы данных. Маршруты authRoutes отвечают за регистрацию, вход, получение текущего пользователя и сброс пароля, а libraryRoutes реализуют операции с книгами, сессиями, заметками, цитатами, экспортом и аналитическими данными.",
        "Маршруты работают совместно с middleware авторизации. После получения запроса middleware извлекает JWT-токен из заголовка Authorization, проверяет его подпись, а затем передает в обработчик идентификатор текущего пользователя. Благодаря этому каждая операция над книгами, заметками и статистикой выполняется строго в пределах данных владельца учетной записи.",
        "Бизнес-логика вынесена в сервисные модули. Так, statsService формирует сводные показатели и данные для графиков, recommendationService подбирает книги на основе жанров и пользовательских оценок, exportService подготавливает выгрузку в форматах Markdown, JSON, TXT и PDF, а initDatabase создает структуру SQLite и наполняет систему демонстрационными записями для проверки интерфейса и отчетных материалов.",
        "Ключевые пользовательские действия обрабатываются на сервере по единым правилам предметной области. При добавлении книги со статусом «Прочитано» сервер автоматически устанавливает прогресс 100 процентов и текущую страницу, а при фиксации нового сеанса чтения пересчитывает фактический прогресс, обновляет статистику и при необходимости изменяет статус книги.",
        "Отдельный контур реализован для экспорта материалов. После выбора книги сервер собирает связанные с ней сведения о сеансах чтения, заметках и цитатах, формирует текстовое или PDF-представление, добавляет корректное имя файла и передает результат клиенту для скачивания или предварительного просмотра.",
        "Важной частью технической реализации являются защитные механизмы. На сервере реализовано ограничение числа неудачных попыток входа, после превышения которого учетная запись по указанному логину временно блокируется. Дополнительно введен упрощенный сценарий сброса пароля: пользователь вводит логин и новый пароль, после чего сервер проверяет существование учетной записи, хеширует новый пароль и заменяет сохраненное значение в базе данных.",
        "Таким образом, техническая реализация приложения охватывает все основные уровни современной веб-системы: маршрутизацию пользовательских сценариев, централизованное управление состоянием, серверную обработку бизнес-правил, защищенный доступ к данным и устойчивую работу в локальном и серверном окружении."
    )

    Replace-ParagraphRange -BodyNode $bodyNode -Paragraphs $paragraphs -StartParagraph $serverHeading -EndParagraph $chapter4Heading -ReplacementTexts $serverParagraphs -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $authTestingParagraphs = @(
        "Дополнительно протестирован сценарий упрощенного сброса пароля. Пользователь вводит логин, новый пароль и подтверждение пароля, после чего сервер заменяет сохраненный хэш пароля в базе данных; повторный вход со старым паролем становится невозможным, а вход с новым паролем выполняется успешно.",
        "Также проверен защитный механизм ограничения неудачных попыток входа. После превышения допустимого количества ошибочных вводов сервер возвращает сообщение о временной блокировке, а после успешного сброса пароля и повторной аутентификации счетчик попыток очищается."
    )

    $authTestingTemplateIndex = (Get-ParagraphIndex -Paragraphs $paragraphs -Paragraph $authFiguresReference) - 1
    foreach ($text in $authTestingParagraphs) {
        Insert-ParagraphBefore -BodyNode $bodyNode -Paragraphs $paragraphs -ReferenceParagraph $authFiguresReference -TemplateParagraph $paragraphs[$authTestingTemplateIndex] -Text $text -DocumentXml $documentXml -NamespaceManager $namespaceManager
        $authTestingTemplateIndex++
    }

    Set-ParagraphText -Paragraph $securityParagraph -Text "Безопасность: данные разных пользователей полностью изолированы по user_id. Попытки доступа без токена или к чужим данным возвращают ошибку 401/403, а пароли сохраняются только в виде bcrypt-хэшей." -DocumentXml $documentXml -NamespaceManager $namespaceManager
    $securityTestingText = "В отдельном тестовом сценарии подтверждена корректность защитных механизмов авторизации: после серии неверных вводов сервер временно ограничивает вход по логину пользователя, а процедура сброса пароля позволяет установить новое значение, очистить состояние блокировки и восстановить доступ к учетной записи без потери пользовательских данных."
    $securityTemplateIndex = (Get-ParagraphIndex -Paragraphs $paragraphs -Paragraph $securityFigureReference) - 1
    Insert-ParagraphBefore -BodyNode $bodyNode -Paragraphs $paragraphs -ReferenceParagraph $securityFigureReference -TemplateParagraph $paragraphs[$securityTemplateIndex] -Text $securityTestingText -DocumentXml $documentXml -NamespaceManager $namespaceManager

    $conclusionParagraphs = @(
        "В результате выполнения курсовой работы было разработано и апробировано веб-приложение ReaderDiary, предназначенное для учета и планирования чтения книг. В ходе работы были выполнены анализ предметной области, формализация требований, выбор инструментальных средств, проектирование структуры базы данных и реализация клиентской и серверной частей системы.",
        "Созданное приложение обеспечивает регистрацию и аутентификацию пользователей, ведение персональной библиотеки, фиксацию статусов чтения, сохранение заметок и цитат, учет страниц и времени по сеансам, построение графиков активности, экспорт данных в несколько форматов и формирование рекомендаций на основе истории чтения. Дополнительно реализованы адаптивный интерфейс, развертывание на VPS-сервере и механизмы защиты, включающие ограничение числа неудачных попыток входа и упрощенный сброс пароля.",
        "Практическая ценность полученного результата заключается в возможности использования системы как персонального читательского дневника, доступного с настольных и мобильных устройств. Разработанное решение может служить основой для дальнейшего развития, включая подключение почтового восстановления пароля, расширение рекомендательной подсистемы, внедрение целей чтения и переход на более производительную серверную СУБД при росте нагрузки.",
        "Проведенное тестирование подтвердило корректность основных пользовательских сценариев, работоспособность клиент-серверного взаимодействия и устойчивость базовых защитных механизмов. Поставленная цель курсовой работы достигнута, а разработанное приложение соответствует сформулированным функциональным и нефункциональным требованиям."
    )

    Replace-ParagraphRange -BodyNode $bodyNode -Paragraphs $paragraphs -StartParagraph $conclusionHeading -EndParagraph $bibliographyHeading -ReplacementTexts $conclusionParagraphs -DocumentXml $documentXml -NamespaceManager $namespaceManager

    Replace-Abbreviations -Paragraphs $paragraphs -DocumentXml $documentXml -NamespaceManager $namespaceManager

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


