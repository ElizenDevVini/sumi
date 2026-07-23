let engine, buildApi;
try {
  engine = require("./engine");
  ({ build: buildApi } = require("./api"));
} catch (err) {
  if (err && err.code === "MODULE_NOT_FOUND" && /better-sqlite3/.test(err.message)) {
    console.error("better-sqlite3 is not installed. Run `npm install` in server/ first.");
    process.exit(1);
  }
  throw err;
}

engine.start();

const port = process.env.PORT || 8787;
buildApi().listen(port, () => console.log("sumi engine + api on :" + port));
