import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage, getMediaUrl } from "@/lib/whatsapp";
import { verifyPaymentScreenshot } from "@/lib/vision";

const STUDIO_CONFIG = {
  WELCOME: "Welcome to Ink & Iron Tattoo Studio! 🎨\n\nHow can we help you today?\n1) Chat to understand the process (FAQ)\n2) Fill a quick form\n3) Book a slot directly\n\nReply with 1, 2, or 3.",
  FAQ: "*Ink & Iron FAQ*\n📍 *Pricing:* Starts at $100.\n🧼 *Hygiene:* Hospital-grade sterilization.\n⏳ *Timeline:* 1-4 hours average.\n🔞 *Age:* 18+ only.",
  FORM: "Please fill out this form: https://forms.gle/tattoo-request\n\nReply 'book' when done to choose a slot!",
  QR_URL: "https://raw.githubusercontent.com/vedang569/tattoo-ai-agent/main/public/qr-code.png",
  SLOTS: ["1. Monday, July 6th - 10:00 AM", "2. Monday, July 6th - 2:00 PM", "3. Tuesday, July 7th - 11:00 AM"],
  ARRIVAL_INFO: "✅ *Booking Confirmed!*\n\nOur system verified your payment. 🛡️\n\n*Arrival:* Please arrive 15 mins early.\n*Aftercare:* Keep the wrap for 4 hours, then wash gently.\n\nSee you soon!"
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge, { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value?.messages?.[0]) return NextResponse.json({ status: "ignored" });
    const message = value.messages[0];
    const phone = message.from;
    const profileName = value.contacts?.[0]?.profile?.name || "Client";
    const msgId = message.id;
    let { data: convo } = await supabase.from("conversations").select("*").eq("phone", phone).single();
    if (!convo) {
      const { data: newConvo } = await supabase.from("conversations").insert({ phone, name: profileName, status: 'lead' }).select().single();
      convo = newConvo;
    }
    if (!convo) throw new Error("Session Fail");
    if (convo.mode === "human") return new Response("OK", { status: 200 });
    let reply = "";
    let nextStatus = convo.status;
    let metadata = convo.metadata || {};
    const isImage = message.type === "image";
    const incomingText = (message.text?.body || "").trim().toLowerCase();
    if (incomingText === "restart" || incomingText === "start over") {
      reply = STUDIO_CONFIG.WELCOME; nextStatus = "lead"; metadata = {};
    } else if (convo.status === "lead") {
      if (incomingText === "1") reply = `${STUDIO_CONFIG.FAQ}\n\nReady? Reply '3' to book.`;
      else if (incomingText === "2") reply = STUDIO_CONFIG.FORM;
      else if (incomingText === "3" || incomingText === "book") { reply = "Great! Please describe your tattoo idea, body placement, and preferred date."; nextStatus = "awaiting_details"; }
      else reply = STUDIO_CONFIG.WELCOME;
    } else if (convo.status === "awaiting_details") {
      if (incomingText.length < 10) reply = "Please give more detail about your idea so we can prep.";
      else { metadata.details = incomingText; reply = `Got it! Pick a slot:\n\n${STUDIO_CONFIG.SLOTS.join("\n")}`; nextStatus = "awaiting_slot"; }
    } else if (convo.status === "awaiting_slot") {
      const selection = parseInt(incomingText);
      if (isNaN(selection) || selection < 1 || selection > STUDIO_CONFIG.SLOTS.length) reply = `Invalid. Pick 1, 2, or 3:\n\n${STUDIO_CONFIG.SLOTS.join("\n")}`;
      else { metadata.selected_slot = STUDIO_CONFIG.SLOTS[selection - 1]; reply = `Perfect. To lock in ${metadata.selected_slot}, we need a $50 deposit.\n\nScan the QR code below and SEND A SCREENSHOT of the receipt here once done! 📸`; nextStatus = "awaiting_payment"; }
    } else if (convo.status === "awaiting_payment") {
      if (isImage) {
        const imageUrl = await getMediaUrl(message.image.id);
        const isVerified = await verifyPaymentScreenshot(imageUrl);
        if (isVerified) {
          reply = STUDIO_CONFIG.ARRIVAL_INFO; nextStatus = "booked";
          await supabase.from("bookings").insert({ conversation_id: convo.id, slot: metadata.selected_slot, details: metadata.details, payment_status: 'paid' });
        } else reply = "I couldn't verify that payment receipt. Please send a clear screenshot of your transaction confirmation. 🧐";
      } else if (["paid", "done"].includes(incomingText)) reply = "Great! Please send the screenshot of the receipt so our AI can verify it instantly.";
      else reply = "Waiting for your deposit screenshot to finalize the booking! 📸";
    } else if (convo.status === "booked") reply = "Your booking is confirmed! Reply 'restart' for a new one.";
    await supabase.from("messages").insert([{ conversation_id: convo.id, role: "user", content: incomingText || "[Sent Image]" }, { conversation_id: convo.id, role: "assistant", content: reply }]);
    await supabase.from("conversations").update({ status: nextStatus, metadata: metadata, updated_at: new Date().toISOString() }).eq("id", convo.id);
    await sendWhatsAppMessage(phone, reply);
    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    return new Response("Error", { status: 500 });
  }
}