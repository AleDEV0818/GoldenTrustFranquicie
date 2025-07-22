import express from "express";
import session from "express-session";
import flash from "express-flash";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes.js";
import passport from "passport";
import { initialize } from "./config/passportConfig.js";
import { sessionStore } from "./config/dbConfig.js";
import https from "https";
import fs from "fs";
import fileUpload from "express-fileupload";

const app = express();
const PORT = process.env.PORT || 443;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  key: fs.readFileSync('config/ssl/server.key'),
  cert: fs.readFileSync('config/ssl/4779dbccdf63510b.crt'),
  ca: fs.readFileSync('config/ssl/gd_bundle-g2-g1.crt')
};

initialize(passport);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(session({
    secret: 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: true,
        sameSite: 'strict'
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

const staticOptions = {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }
};

app.use(express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use(fileUpload());

app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

app.use('/', router);

// 404 Not Found handler (after all routes)
app.use((req, res, next) => {
  res.status(404).send(`404 - Página no encontrada: ${req.originalUrl}`);
});

// Error handler (last)
app.use((err, req, res, next) => {
  console.error('Internal Server Error:', err);
  res.status(500).send('500 - Error interno del servidor');
});

https.createServer(options, app).listen(PORT, () => {
    console.log(`✅ Server running at https://localhost:${PORT}`);
});