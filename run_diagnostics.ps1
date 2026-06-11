# ARTVOT Platform Comprehensive Diagnostics Report
# Generated: 05/19/2026 15:31:12

$baseURL = "http://localhost/again"
$reportFile = "c:\xampp\htdocs\again\DIAGNOSTICS_REPORT.txt"
$report = @()

# Add header to report
$report += "=========================================="
$report += "ARTVOT PLATFORM DIAGNOSTICS REPORT"
$report += "Generated: 2026-05-19 15:31:12"
$report += "=========================================="
$report += ""

# Test 1: Main Pages Status
$report += "TEST 1: MAIN PAGES HTTP STATUS"
$report += "-" * 40
$mainPages = @(
    "/",
    "/index.html",
    "/login.html",
    "/admin-login.html",
    "/admin-panel.html"
)

foreach ($page in $mainPages) {
    try {
        $response = Invoke-WebRequest -Uri "${baseURL}${page}" -Method Head -TimeoutSec 5 -ErrorAction Stop
        $report += "[OK] ${page}: HTTP $($response.StatusCode)"
    } catch {
        $report += "[FAIL] ${page}: ERROR - $($_.Exception.Message)"
    }
}

$report += ""

# Test 2: API Endpoints
$report += "TEST 2: API ENDPOINTS JSON RESPONSE FORMAT"
$report += "-" * 40
$apiEndpoints = @(
    "/api/index.php",
    "/api/notifications_api.php"
)

foreach ($endpoint in $apiEndpoints) {
    $report += "`nTesting: ${endpoint}"
    try {
        $response = Invoke-WebRequest -Uri "${baseURL}${endpoint}" -Method Get -TimeoutSec 5 -ErrorAction Stop
        $contentType = $response.Headers["Content-Type"]
        $report += "  Status: $($response.StatusCode)"
        $report += "  Content-Type: ${contentType}"
        
        # Try to parse JSON
        if ($contentType -match "json") {
            try {
                $json = $response.Content | ConvertFrom-Json
                $report += "  JSON Valid: [OK]"
            } catch {
                $report += "  JSON Valid: [FAIL] - $($_.Exception.Message)"
            }
        } else {
            $report += "  Warning: Not JSON content type"
        }
    } catch {
        $report += "  ERROR: $($_.Exception.Message)"
    }
}

$report += ""

# Test 3: Check Database Connection
$report += "TEST 3: DATABASE CONNECTION"
$report += "-" * 40
$dbConfigFile = "c:\xampp\htdocs\again\backend\config\database.php"
if (Test-Path $dbConfigFile) {
    $report += "[OK] Database config file found"
    $content = Get-Content $dbConfigFile -Raw
    if ($content -match "localhost") {
        $report += "[OK] Database configured for localhost"
    }
    if ($content -match "again" -or $content -match "artvot") {
        $report += "[OK] Database name reference found"
    }
} else {
    $report += "[FAIL] Database config file NOT found"
}

$report += ""

# Test 4: Check for 404 Errors and Missing Files
$report += "TEST 4: FILE EXISTENCE CHECKS"
$report += "-" * 40
$requiredFiles = @(
    "c:\xampp\htdocs\again\index.html",
    "c:\xampp\htdocs\again\api\index.php",
    "c:\xampp\htdocs\again\backend\config\database.php",
    "c:\xampp\htdocs\again\admin-panel.html",
    "c:\xampp\htdocs\again\admin-panel.js",
    "c:\xampp\htdocs\again\style.css",
    "c:\xampp\htdocs\again\main.js",
    "c:\xampp\htdocs\again\notifications.js"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        $report += "[OK] $(Split-Path -Leaf $file) - ${size} bytes"
    } else {
        $report += "[FAIL] MISSING: ${file}"
    }
}

$report += ""

# Test 5: Check Error Logs
$report += "TEST 5: ERROR LOG ANALYSIS"
$report += "-" * 40
$errorLogFile = "c:\xampp\htdocs\again\backend\config\error.log"
if (Test-Path $errorLogFile) {
    $logSize = (Get-Item $errorLogFile).Length
    $report += "[OK] Error log file exists - Size: ${logSize} bytes"
    if ($logSize -gt 0) {
        $logLines = @(Get-Content $errorLogFile -Tail 5 -ErrorAction SilentlyContinue)
        if ($logLines.Count -gt 0) {
            $report += "  Last 5 errors:"
            $logLines | ForEach-Object {
                $report += "    - $_"
            }
        }
    } else {
        $report += "  No errors logged (good sign)"
    }
} else {
    $report += "[INFO] No error log file found"
}

$report += ""

# Test 6: Check Upload Directory
$report += "TEST 6: UPLOAD DIRECTORY"
$report += "-" * 40
$uploadDir = "c:\xampp\htdocs\again\api\uploads"
if (Test-Path $uploadDir) {
    $files = Get-ChildItem $uploadDir -File | Measure-Object
    $report += "[OK] Upload directory exists"
    $report += "  Total files: $($files.Count)"
    if ($files.Count -gt 0) {
        Get-ChildItem $uploadDir -File | ForEach-Object {
            $report += "    - $($_.Name) - $($_.Length) bytes"
        }
    }
} else {
    $report += "[FAIL] Upload directory NOT found"
}

$report += ""
$report += "=========================================="
$report += "DIAGNOSTICS COMPLETE"
$report += "=========================================="

# Save report to file
$report | Out-File -FilePath $reportFile -Encoding UTF8 -Force
Write-Host ($report -join "`n")
Write-Host "`nReport saved to: $reportFile"
