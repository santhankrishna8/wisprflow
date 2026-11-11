// Stand-in for whisper-server used by tests: same CLI flags and HTTP API.
const http = require("node:http");
const args = process.argv.slice(2);
const get = (f) => args[args.indexOf(f) + 1];
const port = Number(get("--port"));
let requests = 0;
http
  .createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") return res.end("<html>whisper</html>");
    if (req.method === "POST" && req.url === "/inference") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        requests++;
        const body = Buffer.concat(chunks).toString("latin1");
        const field = (n) => (body.match(new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
        res.setHeader("content-type", "application/json");
        // Like the real server: verbose_json reports which language it detected.
        const verbose =
          field("response_format") === "verbose_json"
            ? { detected_language: "ne", language_probabilities: { ne: 0.5, te: 0.3, hi: 0.1, en: 0.01 } }
            : {};
        res.end(
          JSON.stringify({
            ...verbose,
            text: ` Hello [BLANK_AUDIO]  world. `,
            echo: { hasWav: body.includes("RIFF"), language: field("language"), prompt: field("prompt"), entropy: field("entropy_thold"), model: get("--model"), requests },
          })
        );
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(port, "127.0.0.1");
