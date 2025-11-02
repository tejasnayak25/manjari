let path = require("path");
let fs = require("fs");
let express = require("express");
let app = express();
let archiver = require("archiver");
const multer = require('multer');
const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GOOGLE_AI_API;
const ai = new GoogleGenAI({ apiKey });

const ralpha_generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "application/json",
};

const SYSTEM_INSTRUCTIONS = {
  RANDOM_ALPHA: "Generate 10 random letters with 4 options each for learning purposes. Format: {letters: [{native, target, options}]}",
  RANDOM_WORD: "Generate 10 random words with 4 options each for learning purposes. Format: {words: [{native, target, options}]}",
  RANDOM_SENTENCE: "Generate 10 random sentences with 4 options each for learning purposes. Format: {sentences: [{native, target, options}]}",
  TRACE: "Identify the character in the provided image based on the target language. Format: {letter: string}",
  INFO: "Generate 10 elements to teach alphabets, words, and phrases in the target language based on user experience. Format: {data: [sentence, sentence, ...]}"
};

async function generateContent(model, systemInstruction, config, contents = []) {
  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        ...config,
        systemInstruction
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error generating content:", error);
    throw new Error("Content generation failed");
  }
}

const random_alpha_model = async (data) =>
  await generateContent(
    "gemini-2.5-flash",
    SYSTEM_INSTRUCTIONS.RANDOM_ALPHA,
    ralpha_generationConfig,
    [JSON.stringify(data)]
  );

const random_word_model = async (data) =>
  await generateContent(
    "gemini-2.5-flash",
    SYSTEM_INSTRUCTIONS.RANDOM_WORD,
    ralpha_generationConfig,
    [JSON.stringify(data)]
  );

const sentence_model = async (data) =>
  await generateContent(
    "gemini-2.5-flash",
    SYSTEM_INSTRUCTIONS.RANDOM_SENTENCE,
    ralpha_generationConfig,
    [JSON.stringify(data)]
  );

const trace_model = async (imageData) =>
  await generateContent(
    "gemini-2.5-flash",
    SYSTEM_INSTRUCTIONS.TRACE,
    {},
    imageData
  );

const info_model = async (userExperienceData) =>
  await generateContent(
    "gemini-2.5-flash",
    SYSTEM_INSTRUCTIONS.INFO,
    ralpha_generationConfig,
    [userExperienceData]
  );

let zipDir = path.join(__dirname, "..", "zipfiles");

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, './uploads')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
});
var upload = multer({ storage: storage });

if(process.env['PRODUCTION']) {
    zipDir = path.join("/tmp", "zipfiles");
    
    storage = multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, '/tmp/uploads')
        },
        filename: function (req, file, cb) {
          cb(null, file.originalname)
        }
    });
    upload = multer({ storage: storage });
}

function zipFile(source_dir, dest) {
    return new Promise((resolve, reject) => {
        var output = fs.createWriteStream(dest);
        var archive = archiver('zip');
        
        output.on('close', function () {
            console.log(archive.pointer() + ' total bytes');
            console.log('archiver has been finalized and the output file descriptor has closed.');
            resolve();
        });
        
        archive.on('error', function(err){
            reject(err);
        });
        
        archive.pipe(output);
        
        archive.directory(source_dir, false);
        
        archive.finalize();
    });
}

app.use(express.static(path.join(__dirname, "..")));
app.use(express.json());
// app.use(express.urlencoded());

app.route("/")
.get((req, res) => {
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.route("/service-worker.js")
.get((req, res) => {
    res.sendFile(path.join(__dirname, "..", "service-worker.js"));
});

app.route(`/folder`)
.get(async (req, res) => {
    if(req.headers['sec-fetch-site'] === "same-origin") {
        if(!fs.existsSync(zipDir)) {
            fs.mkdirSync(zipDir);
        }

        let fpath = decodeURIComponent(req.query.path);
        let folder = path.join(__dirname, "..", "assets", "game-assets", fpath);

        if(fs.existsSync(folder)) {
            let data = fs.statSync(folder);
            if(data.isDirectory()) {
                let zipName = fpath.split("/").join("_");

                let zipPath = path.join(zipDir, `${zipName}.zip`);
                if(!fs.existsSync(zipPath)) {
                    await zipFile(folder, zipPath);
                }

                let data = fs.readFileSync(zipPath, { encoding: "base64" });

                res.json({
                    status: 200,
                    data: data
                });
            } else {
                res.json({
                    status: 500
                });
            }
        } else {
            res.json({
                status: 404
            })
        }
    } else {
        res.status(404).end();
    }
});

app.route("/ai/random-alpha")
.post(async (req, res) => {
    let data = req.body;

    try {
        let response = await random_alpha_model(data);
        res.send({
            status: 200,
            content: response
        });
    } catch(e) {
        console.log(e);
        res.send({
            status:500
        });
    }
});

app.route("/ai/random-word")
.post(async (req, res) => {
    let data = req.body;

    try {
        let response = await random_word_model(data);
        res.send({
            status: 200,
            content: response
        });
    } catch(e) {
        res.send({
            status:500
        });
    }
});

app.route("/ai/random-sentence")
.post(async (req, res) => {
    let data = req.body;

    try {
        let response = await sentence_model(data);
        res.send({
            status: 200,
            content: response
        });
    } catch(e) {
        res.send({
            status:500
        });
    }
});

app.route("/ai/info-time")
.post(async (req, res) => {
    let data = req.body;

    try {
        let response = await info_model(data);
        res.send({
            status: 200,
            content: response
        });
    } catch(e) {
        res.send({
            status:500
        });
    }
});

async function uploadToGemini(path, mimeType) {
    const uploadResult = await fileManager.uploadFile(path, {
      mimeType,
      displayName: path,
    });
    const file = uploadResult.file;
    return file;
}

app.post("/ai/trace", upload.single('file'), async (req, res) => {
    let data = req.body.text;
    try {
        let file = req.file;
        let uploadResponse = await uploadToGemini(file.path, file.mimetype);
        let response = await trace_model([
            createUserContent([
                JSON.stringify(data),
                createPartFromUri(uploadResponse.uri, uploadResponse.mimeType),
            ]),
        ]);
        res.send({
            status: 200,
            content: response.response.text()
        })
    } catch(e) {
        res.send({
            status:500
        });
    }
});

app.listen(5000, () => {
    console.log("started");
});