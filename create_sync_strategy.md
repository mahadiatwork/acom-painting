# Create Foreman Sync Strategy (Zoho ➜ Supabase ➜ Save `supabase_id` back to Zoho)

Goal: when a **Foreman** record is created in Zoho CRM, create the row in Supabase table `foremen` and then write the created Supabase row id (UUID) back into Zoho field **`supabase_id`**.

This requires:

1) The webhook [`POST()`](src/app/api/webhooks/foremen/route.ts:12) returns `supabase_id` **only when a row is newly created**.
2) The Zoho Deluge function reads that response and updates the Zoho record field `supabase_id`.

---

## Webhook contract

**Request** (from Zoho):

```json
{
  "id": "6838013000002040390",
  "Email": "mike@example.com",
  "name": "Mike Peters",
  "phone": "..."
}
```

**Response** (from webhook):

- On insert:

```json
{ "success": true, "created": true, "supabase_id": "81e2bedc-f5b0-4f30-bb88-e7897f2f0d9c" }
```

- On update:

```json
{ "success": true, "created": false }
```

---

## Final Zoho Deluge function

> Notes:
> - Uses the correct module API name that successfully loads the record (Foremans/Foremen/Foreman).
> - Only writes `supabase_id` if it is currently blank and the webhook says `created == true`.
> - Safely parses the webhook response whether it comes back as a `Map` or JSON text.

```deluge
void automation.sync_foreman_to_supabase(Int recordId)
{
	// 1) Load the Zoho record, tracking the correct module API name
	moduleName = "Foremans";
	record = zoho.crm.getRecordById(moduleName, recordId);
	if(record == null)
	{
		moduleName = "Foremen";
		record = zoho.crm.getRecordById(moduleName, recordId);
	}
	if(record == null)
	{
		moduleName = "Foreman";
		record = zoho.crm.getRecordById(moduleName, recordId);
	}
	if(record == null)
	{
		info "Foreman record not found for id: " + recordId;
		return;
	}

	existingSupabaseId = ifnull(record.get("supabase_id"), "").trim();

	// 2) Build payload fields
	email = ifnull(record.get("Email"), "").trim();

	name = ifnull(record.get("Name"), "").trim();
	if(name == "")
	{
		first = ifnull(record.get("First_Name"), "").trim();
		last = ifnull(record.get("Last_Name"), "").trim();
		if(first != "" || last != "")
		{
			name = (first + " " + last).trim();
		}
		if(name == "")
		{
			name = email;
		}
	}

	phone = "";
	if(record.get("Phone") != null && record.get("Phone") != "")
	{
		phone = record.get("Phone").toString().trim();
	}
	else if(record.get("Mobile") != null && record.get("Mobile") != "")
	{
		phone = record.get("Mobile").toString().trim();
	}

	// 3) Webhook call
	url = "https://acom-painting.vercel.app/api/webhooks/foremen";
	secret = zoho.crm.getOrgVariable("ZOHO_WEBHOOK_SECRET");
	if(secret == null || secret == "")
	{
		info "ZOHO_WEBHOOK_SECRET is not set. Set it in Zoho CRM Setup > Organization Variables.";
		return;
	}

	// Escape quotes for valid JSON
	emailEsc = email.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
	nameEsc = name.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
	phoneEsc = phone.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
	jsonBody = "{\"id\":\"" + recordId.toString() + "\",\"Email\":\"" + emailEsc + "\",\"name\":\"" + nameEsc + "\",\"phone\":\"" + phoneEsc + "\"}";

	headers = Map();
	headers.put("Authorization", "Bearer " + secret);
	headers.put("Content-Type", "application/json");

	response = invokeurl
	[
		url : url
		type : POST
		body : jsonBody
		headers : headers
	];
	info "Webhook response raw: " + response;

	// 4) Parse response into a Map (handles Map or JSON-text)
	respMap = Map();
	try
	{
		respMap = response.toMap();
	}
	catch (e)
	{
		try
		{
			respMap = response.toString().toMap();
		}
		catch (e2)
		{
			info "Could not parse webhook response as JSON.";
			return;
		}
	}

	// 5) Save supabase_id only on creation (and only if Zoho field is currently blank)
	if(existingSupabaseId == "" && respMap.get("created") == true && respMap.get("supabase_id") != null && respMap.get("supabase_id").toString().trim() != "")
	{
		updateMap = Map();
		updateMap.put("supabase_id", respMap.get("supabase_id").toString().trim());
		updateResp = zoho.crm.updateRecord(moduleName, recordId, updateMap);
		info "Updated Zoho supabase_id: " + updateResp;
	}
}
```

---

## Expected outcome

- Supabase: `public.foremen` row created/updated.
- Zoho: Foreman field `supabase_id` populated with the Supabase UUID on the **first insert only**.

---

# Painter Sync (Zoho ➜ Supabase)

In this project, the painters webhook [`POST()`](src/app/api/webhooks/painters/route.ts:46) uses the Zoho Painter record id as the **primary key** in Supabase (it does `eq('id', id)`), so there is no separate generated UUID to store back in Zoho. The Supabase painter `id` is the same value as the Zoho painter id.

The most common issue with the Deluge script is sending the payload as `parameters:` (form-encoded) instead of a JSON request body. The painters webhook reads `raw = await request.text()` and only parses it as JSON if it starts with `{`.

## Final Zoho Deluge function (Painter)

```deluge
void automation.Create_painter_in_supabase(Int painterId)
{
	// 1) Get Painter record
	rec = zoho.crm.getRecordById("Painters", painterId);
	if(rec == null)
	{
		info "Painter record not found for id: " + painterId;
		return;
	}

	existingSupabaseId = ifnull(rec.get("supabase_id"), "").trim();

	// 2) Extract fields (Zoho keys are capitalized)
	idStr = ifnull(rec.get("id"), "").toString().trim();
	nameVal = ifnull(rec.get("Name"), "").toString().trim();
	emailVal = ifnull(rec.get("Email"), "").toString().trim();
	phoneVal = ifnull(rec.get("Phone"), "").toString().trim();
	activeVal = rec.get("Active");

	if(idStr == "" || nameVal == "")
	{
		info "Missing required painter fields: id and Name";
		return;
	}

	// 3) Build JSON body as a Map (Zoho will stringify it)
	payload = Map();
	payload.put("id", idStr);
	payload.put("Name", nameVal);
	// Optional fields: send empty strings or omit; webhook converts empty to null
	payload.put("Email", emailVal);
	payload.put("Phone", phoneVal);
	if(activeVal != null)
	{
		payload.put("Active", activeVal);
	}

	// 4) Auth
	secret = zoho.crm.getOrgVariable("ZOHO_WEBHOOK_SECRET");
	if(secret == null || secret.trim() == "")
	{
		info "ZOHO_WEBHOOK_SECRET is not set. Set it in Zoho CRM Setup > Organization Variables.";
		return;
	}
	secret = secret.trim();

	headers = Map();
	headers.put("Authorization", "Bearer " + secret);
	headers.put("Content-Type", "application/json");

	url = "https://acom-painting.vercel.app/api/webhooks/painters";
	info "Syncing Painter " + idStr + " to Supabase";

	// IMPORTANT: send JSON in the BODY (not parameters)
	jsonBody = payload.toString();
	response = invokeurl
	[
		url : url
		type : POST
		body : jsonBody
		headers : headers
	];

	info "Painter Sync Response: " + response;

	// If supabase_id field is blank, store the painter id (Supabase uses same id)
	if(existingSupabaseId == "" && idStr != "")
	{
		updateMap = Map();
		updateMap.put("supabase_id", idStr);
		updateResp = zoho.crm.updateRecord("Painters", painterId, updateMap);
		info "Updated Zoho Painter supabase_id: " + updateResp;
	}
}
```
