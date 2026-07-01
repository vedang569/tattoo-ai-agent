import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { content } = await req.json();
    const conversationId = params.id;
    const { data: conversation } = await supabase.from("conversations").select("phone").eq("id", conversationId).single();
    if (!conversation) return NextResponse.json({ error: "Convo not found" }, { status: 404 });
    await sendWhatsAppMessage(conversation.phone, content);
    await supabase.from("messages").insert({ conversation_id: conversationId, role: "assistant", content: content });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}