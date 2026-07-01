import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ error: "Invalid object" }, { status: 400 });
    }
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value?.messages?.[0]) {
      return NextResponse.json({ status: "no_message" });
    }
    const message = value.messages[0];
    const phone = message.from;
    const text = message.text?.body;
    const contact = value.contacts?.[0];
    const name = contact?.profile?.name || "Client";
    if (!text) return NextResponse.json({ status: "unsupported_type" });
    let { data: conversation } = await supabase.from("conversations").select("*").eq("phone", phone).single();
    if (!conversation) {
      const { data: newConvo } = await supabase.from("conversations").insert({ phone, name }).select().single();
      conversation = newConvo;
    }
    if (!conversation) throw new Error("Conversation failed to initialize");
    if (conversation.mode === "human") {
      await supabase.from("messages").insert({ conversation_id: conversation.id, role: "user", content: text });
      return NextResponse.json({ status: "stored_for_human" });
    }
    await supabase.from("messages").insert({ conversation_id: conversation.id, role: "user", content: text, whatsapp_msg_id: message.id });
    const { data: history } = await supabase.from("messages").select("role, content").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(10);
    const formattedHistory = (history || []).map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
    const aiResponse = await getAIResponse(formattedHistory);
    await sendWhatsAppMessage(phone, aiResponse);
    await supabase.from("messages").insert({ conversation_id: conversation.id, role: "assistant", content: aiResponse });
    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}