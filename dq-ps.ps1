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

function getSubstringBetween(word1, word2, str) {
  // Find the starting position (index after word1)
  const startIndex = str.indexOf(word1);
  if (startIndex === -1) return null; // word1 not found

  const contentStart = startIndex + word1.length;
  
  // Case 1: word2 is "end" - get everything after word1 (up to 50 chars)
  if (word2.toLowerCase() === "end") {
    return str.substring(contentStart, contentStart + 50);
  }

  // Case 2: Find word2 after word1
  const endIndex = str.indexOf(word2, contentStart);
  
  if (endIndex === -1) {
    // If word2 isn't found, default to the next 50 chars after word1
    return str.substring(contentStart, contentStart + 50);
  }

  // Extract the content
  const content = str.substring(contentStart, endIndex);

  // Return logic: if less than 50, return all; otherwise, return first 50
  return content.length < 50 
    ? content 
    : content.substring(0, 50);
}

# 1. Create the Outlook Application Object
$Outlook = New-Object -ComObject Outlook.Application

# 2. Create a new Mail Item (0 represents a standard mail item)
$Mail = $Outlook.CreateItem(0)

# 3. Configure the Mail Details
$Mail.To = "recipient@bank.com"
$Mail.Subject = "Automation Success: INC File Uploaded"
$Mail.Body = "The modernization script has successfully moved the file to SharePoint.`n`nTimestamp: $(Get-Date)"

# 4. (Optional) Attach a file if needed
# $Mail.Attachments.Add("C:\Path\To\Your\File.csv")

# 5. Send the Mail
$Mail.Send()

# 6. Clean up the COM Object from memory
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($Outlook) | Out-Null



function downloadAndRedirect(dataString, fileName = "data.csv") {
  // 1. Create a Blob from the string data
  // We use 'text/csv' to tell the browser it's a spreadsheet file
  const blob = new Blob([dataString], { type: 'text/csv;charset=utf-8;' });

  // 2. Create a temporary anchor element
  const link = document.createElement("a");
  
  // 3. Create a URL for the Blob and set it as the href
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  
  // 4. Append to body, click it, and remove it
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 5. Clean up the URL object to free up memory
  URL.revokeObjectURL(url);

  // 6. Redirect to SharePoint (or any link)
  // Using a slight timeout ensures the download process initializes first
  setTimeout(() => {
    window.location.href = "https://yourcompany.sharepoint.com/sites/your-link-here";
  }, 500);
}