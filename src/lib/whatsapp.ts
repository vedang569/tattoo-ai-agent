export async function sendWhatsAppMessage(to: string, body: string, mediaId?: string) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: { body: body },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Meta API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || "Failed to send message via Meta");
  }
  return data;
}

export async function getMediaUrl(mediaId: string): Promise<string> {
  const url = `https://graph.facebook.com/v20.0/${mediaId}`;
  const response = await fetch(url, { headers: { "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } });
  const data = await response.json();
  return data.url;
}