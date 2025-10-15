import express from "express";
import multer from "multer";
import cors from "cors";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Helper to set up __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Create necessary directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const convertedDir = path.join(__dirname, 'converted');
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
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// ✅ Route 1: DOCX to PDF Conversion
app.post("/convert-to-pdf", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const inputFile = req.file.path;
  const outputDir = convertedDir;

  // Use soffice (LibreOffice) to convert the file
  const command = `soffice --headless --convert-to pdf --outdir "${outputDir}" "${inputFile}"`;

  exec(command, (err) => {
    if (err) {
      console.error("Conversion failed:", err);
      return res.status(500).send({ message: "Conversion failed.", error: err.message });
    }

    const outputFileName = path.basename(req.file.originalname, path.extname(req.file.originalname)) + ".pdf";
    const outputFile = path.join(outputDir, outputFileName);

    res.download(outputFile, (err) => {
      if (err) console.error("Error sending file:", err);
      // Clean up uploaded and converted files after sending
      fs.unlinkSync(inputFile);
      fs.unlinkSync(outputFile);
    });
  });
});

// ✅ Route 2: PDF to DOCX Conversion
app.post("/convert-to-word", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const inputFile = req.file.path;
  const outputDir = convertedDir;

  // Use soffice (LibreOffice) to convert the file to docx
  const command = `soffice --headless --convert-to docx --outdir "${outputDir}" "${inputFile}"`;

  exec(command, (err) => {
    if (err) {
      console.error("Conversion failed:", err);
      return res.status(500).send({ message: "Conversion failed.", error: err.message });
    }

    const outputFileName = path.basename(req.file.originalname, path.extname(req.file.originalname)) + ".docx";
    const outputFile = path.join(outputDir, outputFileName);

    res.download(outputFile, (err) => {
      if (err) console.error("Error sending file:", err);
      // Clean up uploaded and converted files after sending
      fs.unlinkSync(inputFile);
      fs.unlinkSync(outputFile);
    });
  });
});


const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));