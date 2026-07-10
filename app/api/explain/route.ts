import Groq from "groq-sdk";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return new Response("Missing GROQ_API_KEY", { status: 500 });
  }
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const { algorithm, stepExplanation, stepIndex, totalSteps, additionalContext } =
    await req.json() as {
      algorithm: string;
      stepExplanation: string;
      stepIndex: number;
      totalSteps: number;
      additionalContext?: string;
    };

  const stream = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    stream: true,
    max_tokens: 150,
    temperature: 0.65,
    messages: [
      {
        role: "system",
        content:
          "You are a friendly networking tutor explaining a packet-simulation step to a student. " +
          "Keep your response to 2-3 concise sentences. Focus on the WHY — the protocol behavior or " +
          "networking principle being demonstrated. Never repeat the step description verbatim. Be direct and conversational.",
      },
      {
        role: "user",
        content:
          `Topic: ${algorithm}\n` +
          `Step ${stepIndex + 1} of ${totalSteps}: "${stepExplanation}"` +
          (additionalContext ? `\nContext: ${additionalContext}` : "") +
          `\n\nExplain what happened and why in plain English.`,
      },
    ],
  });

  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) controller.enqueue(enc.encode(text));
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
