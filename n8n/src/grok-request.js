// Build the Grok API request (xAI Responses API with a strict JSON schema).
const settings = $('Settings').first().json;
const email = $('Prepare email').first().json;
const full = $input.first().json; // AgentMail: get message

const stripHtml = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// extracted_text is just the new part of a reply thread; fall back to the full text, then HTML.
let text = full.extracted_text || full.text || stripHtml(full.extracted_html || full.html) || full.preview || '';
if (text.length > 12000) text = text.slice(0, 12000) + '\n[…truncated]';

const system = settings.system_prompt.replace('{{BUSINESS_PROFILE}}', settings.business_profile);
const user = `From: ${email.from_name} <${email.from_email}>\nSubject: ${email.subject}\n\n${text}`;

return [{
  json: {
    grok_request: {
      model: settings.grok_model,
      store: false,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: { format: { type: 'json_schema', name: 'inbox_triage', schema: settings.schema, strict: true } },
    },
  },
}];
