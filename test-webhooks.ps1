# Test Webhooks Locally (PowerShell)
# Make sure your dev server is running: pnpm dev

$BASE_URL = "http://localhost:3000"
$SECRET = $env:ZOHO_WEBHOOK_SECRET
if (-not $SECRET) {
    $SECRET = "your-secret-here"
    Write-Host "Warning: ZOHO_WEBHOOK_SECRET not set, using placeholder" -ForegroundColor Yellow
}

Write-Host "Testing Webhooks..." -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

# Test Projects Webhook
Write-Host ""
Write-Host "1. Testing Projects Webhook..." -ForegroundColor Green
$projectsBody = @{
    id = "123456789"
    Deal_Name = "Test Project"
    Account_Name = "Test Customer"
    Stage = "Active"
    Shipping_Street = "123 Test St"
    Owner = "Test Owner"
    Supplier_Color = "Red"
    Trim_Coil_Color = "Blue"
    Shingle_Accessory_Color = "Green"
    Gutter_Types = "K-Style"
    Siding_Style = "Vinyl"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/projects" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "x-roofworx-secret" = $SECRET
    } `
    -Body $projectsBody

Write-Host ""

# Test Users Webhook
Write-Host "2. Testing Users Webhook..." -ForegroundColor Green
$usersBody = @{
    id = "987654321"
    Email = "test@example.com"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/users" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "x-roofworx-secret" = $SECRET
    } `
    -Body $usersBody

Write-Host ""

# Test Assignments Webhook (Add)
Write-Host "3. Testing Assignments Webhook (Add)..." -ForegroundColor Green
$assignmentsBody = @{
    portalUserId = "987654321"
    dealId = "123456789"
    action = "add"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/assignments" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "x-roofworx-secret" = $SECRET
    } `
    -Body $assignmentsBody

Write-Host ""
Write-Host "Done! Check your terminal logs and Supabase dashboard." -ForegroundColor Cyan

