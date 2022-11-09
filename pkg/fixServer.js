const fs = require('fs');
const path = require('path');

const serverPath = path.resolve(__dirname, '.next/standalone/server.js');
let serverCode = fs.readFileSync(serverPath).toString();

serverCode = serverCode.replace('process.chdir(__dirname)', '');

fs.writeFileSync(serverPath, serverCode);
