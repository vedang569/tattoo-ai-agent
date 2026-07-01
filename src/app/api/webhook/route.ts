import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFrom = formData.get("From") as string;
    const phone = rawFrom.replace("whatsapp:", "");
    const bodyText = formData.get("Body") as string;
    const profileName = (formData.get("ProfileName") as string) || "Client";
    const msgSid = formData.get("MessageSid") as string;
    const numMedia = parseInt(formData.get("NumMedia") as string || "0");

    let content = bodyText;
    if (numMedia > 0) {
      const mediaUrl = formData.get("MediaUrl0") as string;
      content = bodyText ? `${bodyText}\n\n[USER SENT PHOTO: ${mediaUrl}]` : `[USER SENT PHOTO: ${mediaUrl}]`;
    }

    if (!content) return new Response("Empty", { status: 200 });

    let { data: conversation } = await supabase.from("conversations").select("*").eq("phone", phone).single();
    if (!conversation) {
      const { data: newConvo } = await supabase.from("conversations").insert({ phone, name: profileName }).select().single();
      conversation = newConvo;
    }
    if (!conversation) throw new Error("DB Fail");

    if (conversation.mode === "human") {
      await supabase.from("messages").insert({ conversation_id: conversation.id, role: "user", content: content });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
      return new Response("Queued for human", { status: 200 });
    }

    await supabase.from("messages").insert({ conversation_id: conversation.id, role: "user", content: content, whatsapp_msg_id: msgSid });
    const { data: history } = await supabase.from("messages").select("role, content").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(15);
    const formattedHistory = (history || []).map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
    const aiResponse = await getAIResponse(formattedHistory);
    await sendWhatsAppMessage(phone, aiResponse);
    await supabase.from("messages").insert({ conversation_id: conversation.id, role: "assistant", content: aiResponse });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Critical Webhook Error:", error.message);
    return new Response("Error", { status: 500 });
  }
}