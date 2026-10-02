// Rebuilds public/index.html from data/looks.json (npm run looks:build)
const { buildSite } = require("./looks-admin/server");
buildSite();
console.log("Rebuilt public/index.html from data/looks.json");
