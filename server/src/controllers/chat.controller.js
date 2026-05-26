const { execFile } = require('child_process');

const askChatbot = async (req, res) => {
  const { message } = req.body;

  execFile(
    "python",
    ["rag/app.py", message],
    {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    },
    (error, stdout, stderr) => {
      if (error) {
        console.error(stderr || error.message);

        return res.status(500).json({
          error: "Error al ejecutar IA"
        });
      }

      res.json({
        response: stdout.replace(/�/g, "").trim()
      });
    }
  );
};

module.exports = { askChatbot };