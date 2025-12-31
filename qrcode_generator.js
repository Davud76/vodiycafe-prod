const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const tablesFile = path.join(__dirname, 'data', 'tables.json');
const outputDir = path.join(__dirname, 'qrcodes');

// ensure output folder exists
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// load tables
let tables = [];
if (fs.existsSync(tablesFile)) {
  tables = JSON.parse(fs.readFileSync(tablesFile, 'utf8'));
} else {
  console.error('tables.json not found!');
  process.exit(1);
}

// generate QR codes
(async () => {
  for (const table of tables) {
    const url = `https://www.vodiycafe.com/?token=${table.token}`;
    const qrPath = path.join(outputDir, `table_${table.table}.png`);

    await QRCode.toFile(qrPath, url, {
      color: { dark:'#000000', light:'#ffffff' },
      width: 300
    });

    console.log(`QR code for Table ${table.table} saved → ${qrPath} → ${url}`);
  }
})();
