const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();

const PORT = 9000;

// SSL options
const options = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

// Middleware pour servir les fichiers statiques depuis le dossier "public"
app.use(express.static('public'));

https.createServer(options, app).listen(PORT, () => {
    console.log(`Server is running on https://localhost:${PORT}`);
    console.log(`Access it from your other devices at https://<YOUR_LOCAL_IP_ADDRESS>:${PORT}`);
    console.log('Remember to accept the self-signed certificate in your browser.');
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Error: Port ${PORT} is already in use. Please stop the other process.`);
    } else {
        console.error('Failed to start server:', err);
    }
    process.exit(1);
});
