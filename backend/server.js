import express from "express";
import multer from "multer";
import cors from "cors";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Helper to set up __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Create necessary directories if they don't exist
const uploadsDir = path.join(__dirname, "uploads");
const convertedDir = path.join(__dirname, "converted");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(convertedDir)) fs.mkdirSync(convertedDir);

app.use(cors());
app.use(express.json());

// Set up multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Strip any directory components from the client-supplied name so a name
    // like "../../server.js" cannot escape the uploads directory, and prefix
    // with a timestamp so concurrent uploads of the same name don't collide.
    const safeName = path.basename(file.originalname).replace(/[/\\]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const upload = multer({ storage: storage });

// Remove a file without throwing if it is already gone. fs.unlinkSync on a
// missing path raises, and when it runs inside a response callback that
// exception is uncaught and takes the whole server down.
function safeUnlink(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (err) {
    console.error("Cleanup failed for", filePath, "-", err.message);
  }
}

// Shared conversion handler for both routes. Uses execFile (no shell) so a
// crafted upload filename cannot inject shell commands.
function convertAndRespond(req, res, targetFormat) {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const inputFile = req.file.path;
  // LibreOffice names the output after the *input* file's basename, which now
  // carries our timestamp prefix - derive the expected path from that, not from
  // the original client name.
  const outputFile = path.join(
    convertedDir,
    path.basename(inputFile, path.extname(inputFile)) + "." + targetFormat
  );
  // Friendlier name for the client's "Save as" dialog.
  const downloadName =
    path.basename(req.file.originalname, path.extname(req.file.originalname)) +
    "." +
    targetFormat;

  execFile(
    "soffice",
    ["--headless", "--convert-to", targetFormat, "--outdir", convertedDir, inputFile],
    (err) => {
      if (err) {
        console.error("Conversion failed:", err);
        safeUnlink(inputFile);
        return res
          .status(500)
          .send({ message: "Conversion failed.", error: err.message });
      }

      // LibreOffice occasionally rewrites the output basename (e.g. it drops
      // characters it considers unsafe). If the file we expect isn't there,
      // fail cleanly instead of handing res.download a missing path.
      if (!fs.existsSync(outputFile)) {
        console.error("Expected output not found:", outputFile);
        safeUnlink(inputFile);
        return res
          .status(500)
          .send({ message: "Conversion produced no output file." });
      }

      res.download(outputFile, downloadName, (downloadErr) => {
        if (downloadErr) console.error("Error sending file:", downloadErr);
        safeUnlink(inputFile);
        safeUnlink(outputFile);
      });
    }
  );
}

// --- ROUTES ---

// Route 1: DOCX to PDF Conversion
app.post("/convert-to-pdf", upload.single("file"), (req, res) => {
  convertAndRespond(req, res, "pdf");
});

// Route 2: PDF to DOCX Conversion
app.post("/convert-to-word", upload.single("file"), (req, res) => {
  convertAndRespond(req, res, "docx");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
