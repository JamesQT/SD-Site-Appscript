# Copia la entrega local a la carpeta original indicada por el usuario; no publica en Google.
$ErrorActionPreference = 'Stop'
$projectSource = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$deliveryDestination = 'C:\Users\ULTRA\Downloads\SD-Control-Apps-Script-MVP'
$resolvedDestination = (Resolve-Path -LiteralPath $deliveryDestination).Path
if ($resolvedDestination -ne $deliveryDestination) { throw 'Destino distinto de la carpeta original esperada.' }
$inventory = Get-Content -LiteralPath (Join-Path $projectSource 'project-files.json') -Raw | ConvertFrom-Json
$rootFiles = @($inventory.server) + @($inventory.html) + @('README.md','package.json','project-files.json','.gitignore','.gitattributes')
foreach ($fileName in $rootFiles) {
    if ($fileName -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Nombre de fuente inválido.' }
    Copy-Item -LiteralPath (Join-Path $projectSource $fileName) -Destination (Join-Path $resolvedDestination $fileName) -Force
}
foreach ($folderName in @('docs','tools','tests')) {
    $subfolderSource = Join-Path $projectSource $folderName
    $subfolderDestination = Join-Path $resolvedDestination $folderName
    New-Item -ItemType Directory -Path $subfolderDestination -Force | Out-Null
    Get-ChildItem -LiteralPath $subfolderSource -File | Where-Object { $_.Extension -in @('.md','.cjs','.gs','.ps1') } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $subfolderDestination $_.Name) -Force
    }
}
foreach ($fileName in $rootFiles) {
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $projectSource $fileName) -Algorithm SHA256).Hash
    $destinationHash = (Get-FileHash -LiteralPath (Join-Path $resolvedDestination $fileName) -Algorithm SHA256).Hash
    if ($sourceHash -ne $destinationHash) { throw "La copia no coincide: $fileName" }
}
Write-Output "Fuentes, documentación y pruebas copiadas; $($rootFiles.Count) archivos de raíz verificados."
