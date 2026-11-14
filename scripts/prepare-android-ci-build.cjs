const fs = require("node:fs");
const path = require("node:path");

const expectedPackage = "com.anonymous.mrpillpal";
const versionCode = Number(process.env.ANDROID_VERSION_CODE);
const keystorePath = process.env.ANDROID_KEYSTORE_PATH;
const keystorePassword = process.env.ANDROID_KEYSTORE_PASSWORD;
const keyAlias = process.env.ANDROID_KEY_ALIAS;
const keyPassword = process.env.ANDROID_KEY_PASSWORD;

if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error("ANDROID_VERSION_CODE must be a positive integer.");
}

for (const [name, value] of Object.entries({
  ANDROID_KEYSTORE_PATH: keystorePath,
  ANDROID_KEYSTORE_PASSWORD: keystorePassword,
  ANDROID_KEY_ALIAS: keyAlias,
  ANDROID_KEY_PASSWORD: keyPassword,
})) {
  if (!value) throw new Error(name + " is required to sign a release APK.");
}

const buildFile = path.join(process.cwd(), "android", "app", "build.gradle");
let contents = fs.readFileSync(buildFile, "utf8");

if (!contents.includes("applicationId '" + expectedPackage + "'")) {
  throw new Error("Generated Android project does not use " + expectedPackage + ".");
}

const versionCodeMatches = contents.match(/\bversionCode\s+\d+\b/g) ?? [];
if (versionCodeMatches.length !== 1) {
  throw new Error("Expected exactly one generated Android versionCode entry.");
}
contents = contents.replace(/\bversionCode\s+\d+\b/, "versionCode " + versionCode);

const buildTypesMarker = "    buildTypes {";
if (!contents.includes(buildTypesMarker)) {
  throw new Error("Could not find Android buildTypes block to configure release signing.");
}

const releaseSigningConfig = [
  "    signingConfigs {",
  "        release {",
  "            storeFile rootProject.file(System.getenv(\"ANDROID_KEYSTORE_PATH\"))",
  "            storePassword System.getenv(\"ANDROID_KEYSTORE_PASSWORD\")",
  "            keyAlias System.getenv(\"ANDROID_KEY_ALIAS\")",
  "            keyPassword System.getenv(\"ANDROID_KEY_PASSWORD\")",
  "        }",
  "    }",
  "",
].join("\n");
contents = contents.replace(buildTypesMarker, releaseSigningConfig + buildTypesMarker);

const buildTypesStart = contents.indexOf(buildTypesMarker);
const releaseBlockStart = contents.indexOf("        release {", buildTypesStart);
if (releaseBlockStart < 0) {
  throw new Error("Could not find Android release build type.");
}
const debugSigner = "signingConfig signingConfigs.debug";
const debugSignerIndex = contents.indexOf(debugSigner, releaseBlockStart);
const nextBuildType = contents.indexOf("    packagingOptions {", releaseBlockStart);
if (debugSignerIndex < 0 || (nextBuildType >= 0 && debugSignerIndex > nextBuildType)) {
  throw new Error("Could not find the release build type's debug signing configuration.");
}
contents =
  contents.slice(0, debugSignerIndex) +
  "signingConfig signingConfigs.release" +
  contents.slice(debugSignerIndex + debugSigner.length);

fs.writeFileSync(buildFile, contents);
console.log(
  "Configured " + expectedPackage + " release APK signing and versionCode " + versionCode + ".",
);
