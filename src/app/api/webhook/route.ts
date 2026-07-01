import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const CONFIG = {
    FAQ: "*Ink & Iron FAQ*\n- Pricing: Starts at $100.\n- Hygiene: Hospital-grade sterilization.\n- Age: 18+ only.",
    FORM_LINK: "https://forms.gle/tattoo-request",
    QR_URL: "https://example.com/deposit-qr.png",
    SLOTS: ["1. Mon, July 6 - 11AM", "2. Mon, July 6 - 3PM", "3. Tue, July 7 - 1PM"],
    AFTERCARE: "✅ *Confirmed!*\n*Arrival:* Arrive 15m early.\n*Aftercare:* Keep wrap for 4hrs."
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const phone = (formData.get("From") as string).replace("whatsapp:", "");
    const text = (formData.get("Body") as string).trim().toLowerCase();
    const name = (formData.get("ProfileName") as string) || "Client";

    let { data: convo } = await supabase.from("conversations").select("*").eq("phone", phone).single();
    if (!convo) {
      const { data: newC } = await supabase.from("conversations").insert({ phone, name, status: 'lead' }).select().single();
      convo = newC;
    }

    if (convo.mode === "human") {
        await supabase.from("messages").insert({ conversation_id: convo.id, role: "user", content: text });
        return new Response("Human mode", { status: 200 });
    }

    let reply = "";
    let nextStatus = convo.status;

    if (text === "restart" || text === "start over") {
        reply = "Welcome back! 🎨\n1) FAQ\n2) Form\n3) Book Slot";
        nextStatus = "lead";
    } else if (convo.status === "lead") {
        if (text === "1") {
            reply = `${CONFIG.FAQ}\n\nReady to book? Reply '3' to start.`;
        } else if (text === "2") {
            reply = `Please fill this form: ${CONFIG.FORM_LINK}\n\nReply '3' when done to book your slot.`;
        } else if (text === "3" || text.includes("book")) {
            reply = "Great! Please describe your tattoo idea, body placement, and preferred date.";
            nextStatus = "awaiting_details";
        } else {
            reply = "Welcome to Ink & Iron! 🎨\n1) FAQ\n2) Form\n3) Book Slot\n\nReply with 1, 2, or 3.";
        }
    } else if (convo.status === "awaiting_details") {
        if (text.length < 10) {
            reply = "Please give us a bit more detail (idea, body part, and date).";
        } else {
            reply = `Got it! Pick a slot:\n\n${CONFIG.SLOTS.join("\n")}`;
            nextStatus = "awaiting_slot";
        }
    } else if (convo.status === "awaiting_slot") {
        const slotIdx = parseInt(text) - 1;
        if (isNaN(slotIdx) || slotIdx < 0 || slotIdx >= CONFIG.SLOTS.length) {
            reply = `Invalid choice. Please pick 1, 2, or 3:\n\n${CONFIG.SLOTS.join("\n")}`;
        } else {
            reply = `You picked ${CONFIG.SLOTS[slotIdx]}.\n\nPlease pay the $50 deposit using the QR code below.\nReply 'PAID' once done.`;
            nextStatus = "awaiting_payment";
        }
    } else if (convo.status === "awaiting_payment") {
        if (["paid", "done", "yes"].includes(text)) {
            reply = CONFIG.AFTERCARE;
            nextStatus = "booked";
        } else {
            reply = "We're holding your slot for 24hrs. Please reply 'PAID' once the deposit is sent.";
        }
    } else {
        reply = "Your booking is already confirmed! Reply 'restart' if you need a new one.";
    }

    await supabase.from("messages").insert([{ conversation_id: convo.id, role: "user", content: text }, { conversation_id: convo.id, role: "assistant", content: reply }]);
    await supabase.from("conversations").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", convo.id);
    await sendWhatsAppMessage(phone, reply);
    return new Response("OK", { status: 200 });
  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
}