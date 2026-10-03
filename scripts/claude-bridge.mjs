#!/usr/bin/env node
// Micro-pont local (Sidecar Bridge) pour Claude Code et Anthropic OAuth.
// Élimine les restrictions CORS imposées par Anthropic aux navigateurs pour les abonnements.
// Usage : node scripts/claude-bridge.mjs [--port 8080] [--token sk-ant-oat...]

import http from "node:http";
import https from "node:https";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

let port = 8080;
let defaultToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY || "";

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-p" || args[i] === "--port") port = Number(args[++i]) || 8080;
  if (args[i] === "-t" || args[i] === "--token") defaultToken = args[++i] || "";
}

const defaultIsOAuth = defaultToken.startsWith("sk-ant-oat") || defaultToken.includes("-oat");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "");

  // Santé / Accueil
  if (req.method === "GET" && (pathname === "" || pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "rhetorix-claude-bridge", port }));
    return;
  }

  // Liste des modèles
  if (req.method === "GET" && (pathname === "/v1/models" || pathname === "/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
          { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
          { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
          { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
        ],
      }),
    );
    return;
  }

  // Extraction du token d'authentification
  let authHeader = req.headers["authorization"] || "";
  let xApiKey = req.headers["x-api-key"] || "";
  let token = defaultToken;

  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (xApiKey) {
    token = String(xApiKey).trim();
  }

  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message:
            "Aucun token d'authentification trouvé. Spécifiez CLAUDE_CODE_OAUTH_TOKEN ou passez le token dans les options Rhetorix.",
        },
      }),
    );
    return;
  }

  const isOAuth = token.startsWith("sk-ant-oat") || token.includes("-oat");

  // Relais direct API Anthropic Messages (POST /v1/messages)
  if (req.method === "POST" && (pathname === "/v1/messages" || pathname === "/messages")) {
    try {
      const rawBody = await readBody(req);
      const parsedBody = JSON.parse(rawBody);

      // Si OAuth, s'assurer que le prompt système a le préfixe Claude Code requis
      if (isOAuth) {
        const prefix = "You are Claude Code, Anthropic's official CLI for Claude.\n\n";
        if (typeof parsedBody.system === "string") {
          if (!parsedBody.system.startsWith("You are Claude Code")) {
            parsedBody.system = prefix + parsedBody.system;
          }
        } else if (Array.isArray(parsedBody.system)) {
          // format array de blocs
          parsedBody.system.unshift({ type: "text", text: prefix });
        } else {
          parsedBody.system = prefix;
        }
      }

      const headers = {
        "content-type": "application/json",
        "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
      };

      if (isOAuth) {
        headers["authorization"] = `Bearer ${token}`;
        const clientBeta = req.headers["anthropic-beta"] || "";
        const betas = new Set(clientBeta.split(",").map((s) => s.trim()).filter(Boolean));
        betas.add("oauth-2025-04-20");
        headers["anthropic-beta"] = Array.from(betas).join(",");
      } else {
        headers["x-api-key"] = token;
        if (req.headers["anthropic-beta"]) {
          headers["anthropic-beta"] = req.headers["anthropic-beta"];
        }
      }

      const outgoingBody = JSON.stringify(parsedBody);

      const anthropicReq = https.request(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers,
        },
        (anthropicRes) => {
          res.writeHead(anthropicRes.statusCode || 200, {
            ...anthropicRes.headers,
            "access-control-allow-origin": "*",
          });
          anthropicRes.pipe(res);
        },
      );

      anthropicReq.on("error", (err) => {
        console.error(`${c.red}Erreur relais Anthropic : ${err.message}${c.reset}`);
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: `Erreur relais : ${err.message}` } }));
        }
      });

      anthropicReq.write(outgoingBody);
      anthropicReq.end();
      return;
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(err) } }));
      return;
    }
  }

  // Relais compatible OpenAI (POST /v1/chat/completions)
  if (req.method === "POST" && (pathname === "/v1/chat/completions" || pathname === "/chat/completions")) {
    try {
      const rawBody = await readBody(req);
      const parsed = JSON.parse(rawBody);

      let systemPrompt = "";
      const anthropicMessages = [];

      for (const m of parsed.messages || []) {
        if (m.role === "system") {
          systemPrompt += (systemPrompt ? "\n\n" : "") + (m.content || "");
        } else if (m.role === "user" || m.role === "assistant") {
          anthropicMessages.push({ role: m.role, content: m.content || "" });
        }
      }

      if (parsed.response_format?.json_schema?.schema) {
        systemPrompt += `\n\nCRITICAL: Respond ONLY with a valid JSON object strictly complying with this JSON schema:\n${JSON.stringify(parsed.response_format.json_schema.schema)}\nDo not wrap in markdown fences or include explanations. Output raw JSON only.`;
      }

      if (isOAuth && !systemPrompt.startsWith("You are Claude Code")) {
        systemPrompt = "You are Claude Code, Anthropic's official CLI for Claude.\n\n" + systemPrompt;
      }

      const headers = {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      };

      if (isOAuth) {
        headers["authorization"] = `Bearer ${token}`;
        headers["anthropic-beta"] = "oauth-2025-04-20";
      } else {
        headers["x-api-key"] = token;
      }

      const anthropicBody = {
        model: parsed.model || "claude-3-7-sonnet-20250219",
        max_tokens: parsed.max_tokens || 16000,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: Boolean(parsed.stream),
      };

      const outgoing = JSON.stringify(anthropicBody);

      const anthropicReq = https.request(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers,
        },
        (anthropicRes) => {
          const status = anthropicRes.statusCode || 200;
          if (status >= 400) {
            let errBuffer = "";
            anthropicRes.on("data", (chunk) => (errBuffer += chunk));
            anthropicRes.on("end", () => {
              res.writeHead(status, { "Content-Type": "application/json" });
              res.end(errBuffer);
            });
            return;
          }

          if (!parsed.stream) {
            let buffer = "";
            anthropicRes.on("data", (chunk) => (buffer += chunk));
            anthropicRes.on("end", () => {
              try {
                const data = JSON.parse(buffer);
                const text = data.content?.[0]?.text || "";
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    id: data.id || "chatcmpl-" + Date.now(),
                    object: "chat.completion",
                    choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
                  }),
                );
              } catch {
                res.writeHead(status, { "Content-Type": "application/json" });
                res.end(buffer);
              }
            });
            return;
          }

          // En mode streaming SSE : traduction des événements Anthropic vers format OpenAI
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });

          let sseBuffer = "";
          anthropicRes.on("data", (chunk) => {
            sseBuffer += chunk.toString("utf8");
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") {
                res.write("data: [DONE]\n\n");
                continue;
              }
              try {
                const event = JSON.parse(payload);
                if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                  const chunkOpenAi = {
                    choices: [{ delta: { content: event.delta.text } }],
                  };
                  res.write(`data: ${JSON.stringify(chunkOpenAi)}\n\n`);
                }
              } catch {
                // ignorer chunks non-json
              }
            }
          });

          anthropicRes.on("end", () => {
            res.write("data: [DONE]\n\n");
            res.end();
          });
        },
      );

      anthropicReq.on("error", (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: `Erreur pont : ${err.message}` } }));
        }
      });

      anthropicReq.write(outgoing);
      anthropicReq.end();
      return;
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(err) } }));
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: `Route introuvable : ${pathname}` } }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`\n${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}      RHETORIX — Pont Local Claude Code (Abonnement OAuth)      ${c.reset}`);
  console.log(`${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(`  ${c.green}✔ Pont actif sur :${c.reset}  ${c.bold}http://localhost:${port}/v1${c.reset}`);
  console.log(`  ${c.green}✔ Mode OAuth :${c.reset}      ${defaultIsOAuth ? c.green + "Actif (sk-ant-oat)" : c.yellow + "(détecté par requête)"}${c.reset}`);
  console.log(`  ${c.green}✔ Contournement CORS :${c.reset} Actif (requêtes directes Node.js vers Anthropic)`);
  console.log(`${c.dim}----------------------------------------------------------------${c.reset}`);
  console.log(`Dans les options Rhetorix :`);
  console.log(`  1. Fournisseur : ${c.yellow}Anthropic${c.reset} ou ${c.yellow}Compatible OpenAI${c.reset}`);
  console.log(`  2. Endpoint :    ${c.yellow}http://localhost:${port}/v1${c.reset}`);
  console.log(`  3. Clé :         ${c.dim}(Votre token OAuth ou vide si exporté en variable)${c.reset}`);
  console.log(`${c.dim}----------------------------------------------------------------\n${c.reset}`);
});
