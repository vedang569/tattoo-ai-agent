import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const STUDIO_CONFIG = {
  WELCOME: "Welcome to Ink & Iron Tattoo Studio! 🎨\n\nHow can we help you today?\n1) Chat to understand the process (FAQ)\n2) Fill a quick form\n3) Book a slot directly\n\nReply with 1, 2, or 3.",
  FAQ: "*Ink & Iron FAQ*\n📍 *Pricing:* Starts at $100.\n🧼 *Hygiene:* Hospital-grade sterilization.\n⏳ *Timeline:* 1-4 hours average.\n🔞 *Age:* 18+ only.",
  FORM: "Please fill out this form: https://forms.gle/tattoo-request\n\nReply 'book' when done to choose a slot!",
  QR_URL: "https://raw.githubusercontent.com/vedang569/tattoo-ai-agent/main/public/qr-code.png",
  SLOTS: [
    "1. Monday, July 6th - 10:00 AM",
    "2. Monday, July 6th - 2:00 PM",
    "3. Tuesday, July 7th - 11:00 AM"
  ],
  ARRIVAL_INFO: "✅ *Booking Confirmed!*\n\n*Arrival:* Please arrive 15 mins early.\n*Aftercare:* Keep the wrap for 4 hours, then wash gently.\n\nSee you soon!"
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const phone = (formData.get("From") as string).replace("whatsapp:", "");
    const incomingText = (formData.get("Body") as string || "").trim();
    const lowerText = incomingText.toLowerCase();
    const profileName = (formData.get("ProfileName") as string) || "Client";

    let { data: convo } = await supabase.from("conversations").select("*").eq("phone", phone).single();
    if (!convo) {
      const { data: newConvo } = await supabase.from("conversations").insert({ phone, name: profileName, status: 'lead' }).select().single();
      convo = newConvo;
    }
    if (!convo) throw new Error("DB Connection Error");

    if (convo.mode === "human") {
      await supabase.from("messages").insert({ conversation_id: convo.id, role: "user", content: incomingText });
      return new Response("Handled by human", { status: 200 });
    }

    let reply = "";
    let nextStatus = convo.status;
    let metadata = convo.metadata || {};
    let mediaUrl = undefined;

    if (lowerText === "restart" || lowerText === "start over") {
      reply = STUDIO_CONFIG.WELCOME;
      nextStatus = "lead";
      metadata = {};
    } else if (convo.status === "lead") {
      if (lowerText === "1") {
        reply = `${STUDIO_CONFIG.FAQ}\n\nReady? Reply '3' to book a slot.`;
      } else if (lowerText === "2") {
        reply = STUDIO_CONFIG.FORM;
      } else if (lowerText === "3" || lowerText === "book") {
        reply = "Great choice! Please tell us:\n1. Your tattoo idea\n2. Body placement\n3. Preferred month/date";
        nextStatus = "awaiting_details";
      } else {
        reply = STUDIO_CONFIG.WELCOME;
      }
    } else if (convo.status === "awaiting_details") {
      if (incomingText.length < 10) {
        reply = "Please provide a bit more detail about your idea so we can prep for you!";
      } else {
        metadata.details = incomingText;
        reply = `Got it! Here are our available slots. Which one works for you?\n\n${STUDIO_CONFIG.SLOTS.join("\n")}`;
        nextStatus = "awaiting_slot";
      }
    } else if (convo.status === "awaiting_slot") {
      const selection = parseInt(incomingText);
      if (isNaN(selection) || selection < 1 || selection > STUDIO_CONFIG.SLOTS.length) {
        reply = `Invalid choice. Please reply with 1, 2, or 3:\n\n${STUDIO_CONFIG.SLOTS.join("\n")}`;
      } else {
        metadata.selected_slot = STUDIO_CONFIG.SLOTS[selection - 1];
        reply = `Perfect. To lock in ${metadata.selected_slot}, we require a $50 deposit.\n\nScan the QR code below to pay. Reply 'PAID' once done!`;
        nextStatus = "awaiting_payment";
        mediaUrl = STUDIO_CONFIG.QR_URL;
      }
    } else if (convo.status === "awaiting_payment") {
      if (["paid", "done", "yes", "i paid"].includes(lowerText)) {
        reply = STUDIO_CONFIG.ARRIVAL_INFO;
        nextStatus = "booked";
        await supabase.from("bookings").insert({ conversation_id: convo.id, slot: metadata.selected_slot, details: metadata.details, payment_status: 'paid' });
      } else if (["no", "not yet", "later"].includes(lowerText)) {
        reply = "No problem! We'll hold the slot for 24 hours. Message 'PAID' when you're ready.";
      } else {
        reply = "Waiting for your deposit confirmation. Reply 'PAID' once sent so we can finalize your booking! 🎨";
      }
    } else if (convo.status === "booked") {
      reply = "Your booking is confirmed! If you need to make changes or start a new booking, reply 'restart'.";
    }

    await supabase.from("messages").insert([{ conversation_id: convo.id, role: "user", content: incomingText }, { conversation_id: convo.id, role: "assistant", content: reply }]);
    await supabase.from("conversations").update({ status: nextStatus, metadata: metadata, updated_at: new Date().toISOString() }).eq("id", convo.id);
    await sendWhatsAppMessage(phone, reply, mediaUrl);
    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return new Response(error.message, { status: 500 });
  }
}