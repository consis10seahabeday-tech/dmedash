#Install-Module -Name "PnP.PowerShell" -Scope CurrentUser -AllowClobber
Import-Module PnP.PowerShell
# 1. Dynamically locate the HTML file in the script's current directory
$htmlPath = Join-Path -Path $PSScriptRoot -ChildPath "index.html"

if (Test-Path $htmlPath) {
    Write-Host "Launching local interface: $htmlPath" -ForegroundColor Cyan
    Start-Process $htmlPath
} else {
    Write-Warning "index.html not found in $PSScriptRoot. Proceeding with transformation..."
}

# 2. Connect to SharePoint
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/YourProject" -Interactive

# 3. Initialize Control Variables
$fileFound = $false
$attempts = 0
$maxAttempts = 10
$retryIntervalSeconds = 60 

# 4. Polling Loop
while (-not $fileFound -and $attempts -lt $maxAttempts) {
    $attempts++
    $downloadPath = "$env:USERPROFILE\Downloads"
    $timeThreshold = (Get-Date).AddMinutes(-5) 

    Write-Host "Attempt $attempts of $maxAttempts: Searching for 'INC' file..." -ForegroundColor Gray

    # Search for the file
    $targetFile = Get-ChildItem -Path $downloadPath | 
        Where-Object { $_.Name -like "INC*" -and $_.LastWriteTime -gt $timeThreshold } | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 1

    if ($targetFile) {
        Write-Host "Match Found: $($targetFile.Name). Uploading to cloud..." -ForegroundColor Cyan
        Add-PnPFile -Path $targetFile.FullName -Folder "Shared Documents/ProjectFolder"
        Write-Host "Upload complete. Workflow transformed." -ForegroundColor Green
        $fileFound = $true
    } elseif ($attempts -lt $maxAttempts) {
        Write-Host "File not found. Retrying in 1 minute..." -ForegroundColor Yellow
        Start-Sleep -Seconds $retryIntervalSeconds
    } else {
        Write-Error "Maximum attempts reached (10 mins). Script terminated."
    }
}