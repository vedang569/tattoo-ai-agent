import OpenAI from "openai";
import { TATTOO_STUDIO_PROMPT } from "./system-prompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIResponse(messages: { role: "user" | "assistant" | "system"; content: string }[]) {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      { role: "system", content: TATTOO_STUDIO_PROMPT },
      ...messages
    ],
    temperature: 0.7,
  });

  return response.choices[0].message.content || "I'm sorry, I'm having trouble thinking right now. Let me get a human to help you.";
}