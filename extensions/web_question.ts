import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OptionSchema = Type.Object({
  label: Type.String(),
  description: Type.Optional(Type.String()),
});

const QuestionSchema = Type.Object({
  question: Type.String(),
  header: Type.String(),
  options: Type.Array(OptionSchema, { minItems: 2, maxItems: 4 }),
  multiSelect: Type.Boolean(),
});

const ParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 4 }),
});

type Question = {
  question: string;
  header: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect: boolean;
};

type Params = { questions: Question[] };

type ResponseFile = {
  answers?: Record<string, string>;
  cancelled?: boolean;
};

function encodeId(id: string): string {
  return Buffer.from(id).toString("base64url");
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("question cancelled"));
    }, { once: true });
  });
}

export default function webQuestion(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Ask user question",
    description: "Ask the web user 1-4 structured questions with clickable options.",
    parameters: ParamsSchema,
    async execute(toolCallId, params: Params, signal) {
      const dir = process.env.PI_WEB_QUESTION_DIR;
      if (!dir) {
        return {
          content: [{ type: "text", text: "ask_user_question unavailable: PI_WEB_QUESTION_DIR is not set" }],
          details: { questions: params.questions, answers: {}, cancelled: true },
          isError: true,
        };
      }

      await mkdir(dir, { recursive: true });
      const key = encodeId(toolCallId);
      const requestPath = join(dir, `${key}.request.json`);
      const responsePath = join(dir, `${key}.response.json`);
      await writeFile(requestPath, JSON.stringify({ toolCallId, questions: params.questions, createdAt: Date.now() }), "utf8");

      while (!signal.aborted) {
        try {
          const raw = await readFile(responsePath, "utf8");
          const response = JSON.parse(raw) as ResponseFile;
          if (response.cancelled) {
            return {
              content: [{ type: "text", text: "User cancelled the question" }],
              details: { questions: params.questions, answers: {}, cancelled: true },
            };
          }
          const answers = response.answers || {};
          const text = params.questions
            .map((q) => `"${q.question}" = "${answers[q.question] || ""}"`)
            .join("\n");
          return {
            content: [{ type: "text", text }],
            details: { questions: params.questions, answers, cancelled: false },
          };
        } catch {
          await sleep(250, signal);
        }
      }

      return {
        content: [{ type: "text", text: "User cancelled the question" }],
        details: { questions: params.questions, answers: {}, cancelled: true },
      };
    },
  });
}
