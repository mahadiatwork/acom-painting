#!/bin/bash

# Test Webhooks Locally
# Make sure your dev server is running: pnpm dev

BASE_URL="http://localhost:3000"
SECRET="${ZOHO_WEBHOOK_SECRET:-your-secret-here}"

echo "Testing Webhooks..."
echo "==================="

# Test Projects Webhook
echo ""
echo "1. Testing Projects Webhook..."
curl -X POST "$BASE_URL/api/webhooks/projects" \
  -H "Content-Type: application/json" \
  -H "x-roofworx-secret: $SECRET" \
  -d '{
    "id": "123456789",
    "Deal_Name": "Test Project",
    "Account_Name": "Test Customer",
    "Stage": "Active",
    "Shipping_Street": "123 Test St",
    "Owner": "Test Owner",
    "Supplier_Color": "Red",
    "Trim_Coil_Color": "Blue",
    "Shingle_Accessory_Color": "Green",
    "Gutter_Types": "K-Style",
    "Siding_Style": "Vinyl"
  }'

echo ""
echo ""

# Test Users Webhook
echo "2. Testing Users Webhook..."
curl -X POST "$BASE_URL/api/webhooks/users" \
  -H "Content-Type: application/json" \
  -H "x-roofworx-secret: $SECRET" \
  -d '{
    "id": "987654321",
    "Email": "test@example.com"
  }'

echo ""
echo ""

# Test Assignments Webhook (Add)
echo "3. Testing Assignments Webhook (Add)..."
curl -X POST "$BASE_URL/api/webhooks/assignments" \
  -H "Content-Type: application/json" \
  -H "x-roofworx-secret: $SECRET" \
  -d '{
    "portalUserId": "987654321",
    "dealId": "123456789",
    "action": "add"
  }'

echo ""
echo ""
echo "Done! Check your terminal logs and Supabase dashboard."

