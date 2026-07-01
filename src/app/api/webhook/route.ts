import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFrom = formData.get("From") as string;
    const phone = rawFrom.replace("whatsapp:", "");
    const text = formData.get("Body") as string;
    const name = (formData.get("ProfileName") as string) || "Client";
    const twilioMsgId = formData.get("MessageSid") as string;

    if (!text) return NextResponse.json({ status: "no_text" });

    let { data: conversation } = await supabase.from("conversations").select("*").eq("phone", phone).single();
    if (!conversation) {
      const { data: newConvo } = await supabase.from("conversations").insert({ phone, name }).select().single();
      conversation = newConvo;
    }
    if (!conversation) throw new Error("Conversation failed to initialize");

    if (conversation.mode === "human") {
      await supabase.from("messages").insert({ conversation_id: conversation.id, role: "user", content: text });
      return new Response("Stored for human", { status: 200 });
    }

    await supabase.from("messages").insert({ conversation_id: conversation.id, role: "user", content: text, whatsapp_msg_id: twilioMsgId });
    const { data: history } = await supabase.from("messages").select("role, content").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(10);
    const formattedHistory = (history || []).map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
    const aiResponse = await getAIResponse(formattedHistory);
    await sendWhatsAppMessage(phone, aiResponse);
    await supabase.from("messages").insert({ conversation_id: conversation.id, role: "assistant", content: aiResponse });
    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return new Response(error.message, { status: 500 });
  }
}