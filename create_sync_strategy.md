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
