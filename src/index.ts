import express, { Request, Response } from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "src/public")));

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Get current weather of city.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name e.g. Pune" },
        },
        required: ["city"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "calculate",
      description: "Evaluate a math expression and return the result",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "e.g. 12 * 4 + 7" },
        },
        required: ["expression"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web and return relevant snippets",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];

function getWeather(city: string) {
  const data: Record<string, object> = {
    pune:      { temp: 34, condition: "Sunny",  humidity: "42%" },
    mumbai:    { temp: 31, condition: "Cloudy", humidity: "78%" },
    delhi:     { temp: 38, condition: "Hazy",   humidity: "55%" },
    bangalore: { temp: 26, condition: "Partly cloudy", humidity: "60%" },
  };
  return data[city.toLowerCase()] ?? { temp: 28, condition: "Clear", humidity: "50%" };
}

function calculate(expression: string) {
  try {
    const result = Function(`"use strict"; return (${expression})`)();
    return { result, expression };
  } catch {
    return { error: "Invalid expression" };
  }
}

function search_web(query: string) {
  return {
    query,
    results: [
      { title: `What is ${query}?`, snippet: `${query} is a widely discussed topic with many aspects...` },
      { title: `${query} — latest insights`, snippet: `Recent developments around ${query} suggest significant progress...` },
    ],
  };
}

function executeTool(name: string, args: Record<string, string>) {
  console.log(`Calling tool: ${name}`, args);
  switch (name) {
    case "getWeather": return getWeather(args.city);
    case "calculate":   return calculate(args.expression);
    case "search_web":  return search_web(args.query);
    default:            return { error: "Unknown tool" };
  }
}

type Message = OpenAI.Chat.ChatCompletionMessageParam;

async function runAgent(userMessage: string): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content: "You are a helpful assistant with access to tools. Use them when needed to give accurate answers.",
    },
    { role: "user", content: userMessage },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      tools,
      messages,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === "stop") {
      return choice.message.content ?? "";
    }

    if (choice.finish_reason === "tool_calls") {
      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls ?? []) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = executeTool(toolCall.function.name, args);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

    }
  }
}

app.post("/chat", async (req: Request, res: Response) => {
  const { message }: { message: string } = req.body;

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const reply = await runAgent(message);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
