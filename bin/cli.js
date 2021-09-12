#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const commander_1 = require("commander");
const fs_extra_1 = __importDefault(require("fs-extra"));
const promise_1 = __importDefault(require("md5-dir/promise"));
const zip_a_folder_1 = require("zip-a-folder");
const version = "1.0.3";
commander_1.program.version(version);
commander_1.program
    .option("-ts, --source <string>", "folder to put the sources", "./")
    .option("-o, --output <string>", "directory where the .zip and release.json files are stored", "./");
commander_1.program.parse(process.argv);
const { source: ROOT_PATH, output: DIST_PATH } = commander_1.program.opts();
// path.join(__dirname, "../../src/assets", path.basename(__dirname));
function existsFile(uri) {
    return new Promise((resolve) => {
        if (/^https?:\/\//.test(uri)) {
            resolve(true);
        }
        else {
            fs_extra_1.default.lstat(uri, (err, stat) => {
                if (err) {
                    resolve(false);
                }
                else {
                    resolve(stat.isFile());
                }
            });
        }
    });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(json) {
    try {
        return JSON.parse(json);
    }
    catch {
        return {};
    }
}
async function fixTemplate(template) {
    const directoryName = path_1.default.basename(template);
    const uriRelease = path_1.default.join(DIST_PATH, directoryName, "Release.json");
    const ReleaseJSONFile = (await existsFile(uriRelease))
        ? parse(fs_extra_1.default.readFileSync(uriRelease, "utf8"))
        : {};
    const Release = {
        ...ReleaseJSONFile,
        ...parse((await existsFile(path_1.default.join(template, "Release.json")))
            ? fs_extra_1.default.readFileSync(path_1.default.join(template, "Release.json"), "utf8")
            : "{}"),
    };
    // eslint-disable-next-line functional/immutable-data
    Release.name = directoryName;
    // eslint-disable-next-line functional/immutable-data
    Release["directory-name"] = directoryName;
    // eslint-disable-next-line functional/immutable-data
    Release.images = [];
    // eslint-disable-next-line functional/immutable-data
    Release.icons = [];
    await Promise.all((await fs_extra_1.default.readdir(template)).map(async (filename) => {
        if (/^image_/.test(filename) &&
            (await fs_extra_1.default.lstat(path_1.default.join(template, filename))).isFile()) {
            Release.images.push(path_1.default.relative(directoryName, path_1.default.join(directoryName, filename)));
            await fs_extra_1.default.copy(path_1.default.join(template, filename), path_1.default.join(DIST_PATH, directoryName, filename));
        }
        if (/^icon_/.test(filename) &&
            (await fs_extra_1.default.lstat(path_1.default.join(template, filename))).isFile()) {
            Release.icons.push(path_1.default.relative(directoryName, path_1.default.join(directoryName, filename)));
            await fs_extra_1.default.copy(path_1.default.join(template, filename), path_1.default.join(DIST_PATH, directoryName, filename));
        }
    }));
    if (Release.images.length === 0) {
        // eslint-disable-next-line functional/immutable-data
        delete Release.images;
    }
    if (Release.icons.length === 0) {
        // eslint-disable-next-line functional/immutable-data
        delete Release.icons;
    }
    const uriFolderTemplate = path_1.default.join(template, "template");
    if (fs_extra_1.default.existsSync(uriFolderTemplate) &&
        fs_extra_1.default.statSync(uriFolderTemplate).isDirectory()) {
        const md5FolderTemplate = await (0, promise_1.default)(uriFolderTemplate);
        const uriTemplateZip = path_1.default.join(DIST_PATH, directoryName, "template.zip");
        // eslint-disable-next-line functional/immutable-data
        Release.isTemplate = true;
        // eslint-disable-next-line functional/immutable-data
        Release.MD5 = md5FolderTemplate;
        if (fs_extra_1.default.existsSync(uriTemplateZip) === false ||
            md5FolderTemplate !== ReleaseJSONFile.MD5) {
            console.info(`${template}: creating template.zip`);
            await (0, zip_a_folder_1.zip)(uriFolderTemplate, uriTemplateZip);
        }
        const stat = fs_extra_1.default.lstatSync(uriTemplateZip);
        // eslint-disable-next-line functional/immutable-data
        Release.mtimeMs = stat.mtimeMs;
    }
    else {
        // eslint-disable-next-line functional/immutable-data
        Release.isTemplate = false;
    }
    if (JSON.stringify(Release) !== JSON.stringify(ReleaseJSONFile)) {
        await fs_extra_1.default.outputFile(uriRelease, JSON.stringify(Release, undefined, "  "));
        console.log(chalk_1.default.green(`${template}: Saved Release.json`));
    }
    return Release;
}
async function build() {
    const sort = [
        ...new Set(fs_extra_1.default.existsSync(path_1.default.join(ROOT_PATH, "sort.txt"))
            ? fs_extra_1.default
                .readFileSync(path_1.default.join(ROOT_PATH, "sort.txt"), "utf8")
                .split("\n")
                .map((item) => item.trim())
            : []),
    ];
    // eslint-disable-next-line functional/prefer-readonly-type
    const templates = (await Promise.all(fs_extra_1.default
        .readdirSync(ROOT_PATH)
        .map(async (template) => {
        template = path_1.default.join(ROOT_PATH, template);
        if (fs_extra_1.default.lstatSync(template).isDirectory()) {
            return await fixTemplate(template);
        }
    })))
        // eslint-disable-next-line functional/prefer-readonly-type
        .filter((item) => item !== undefined);
    const templatesSorted = [];
    const newSort = [];
    sort.forEach((item) => {
        const exists = templates.findIndex((template) => template.name === item);
        if (exists > -1) {
            // eslint-disable-next-line functional/immutable-data
            newSort.push(item);
            // eslint-disable-next-line functional/immutable-data
            templatesSorted.push(templates.splice(exists, 1)[0]);
        }
    });
    // eslint-disable-next-line functional/immutable-data
    const templateNotSort = templates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    // eslint-disable-next-line functional/immutable-data
    templatesSorted.push(...templateNotSort);
    // eslint-disable-next-line functional/immutable-data
    newSort.push(...templateNotSort.map((item) => item.name));
    if (sort.join("\n") !== newSort.join("\n")) {
        await fs_extra_1.default.outputFile(path_1.default.join(ROOT_PATH, "sort.txt"), newSort.join("\n"));
        console.log(chalk_1.default.green("Saved sort.txt"));
    }
    const uriReleaseJson = path_1.default.join(DIST_PATH, "Release.json");
    const oldRelease = fs_extra_1.default.existsSync(uriReleaseJson)
        ? parse(fs_extra_1.default.readFileSync(uriReleaseJson, "utf8"))
        : {};
    if (JSON.stringify(oldRelease) !== JSON.stringify(templatesSorted)) {
        await fs_extra_1.default.outputFile(uriReleaseJson, JSON.stringify(templatesSorted, undefined, "  "));
        console.log(chalk_1.default.green("Saved Release.json"));
    }
}
build();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFFQSxnREFBd0I7QUFFeEIsa0RBQTBCO0FBQzFCLHlDQUFvQztBQUNwQyx3REFBMEI7QUFDMUIsOERBQWtDO0FBQ2xDLCtDQUFtQztBQUVuQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUM7QUFFeEIsbUJBQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFekIsbUJBQU87S0FDSixNQUFNLENBQUMsd0JBQXdCLEVBQUUsMkJBQTJCLEVBQUUsSUFBSSxDQUFDO0tBQ25FLE1BQU0sQ0FDTCx1QkFBdUIsRUFDdkIsNERBQTRELEVBQzVELElBQUksQ0FDTCxDQUFDO0FBRUosbUJBQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRTVCLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxtQkFBTyxDQUFDLElBQUksRUFBRSxDQUFDO0FBV2hFLHNFQUFzRTtBQUV0RSxTQUFTLFVBQVUsQ0FBQyxHQUFXO0lBQzdCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUM3QixJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDNUIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2Y7YUFBTTtZQUNMLGtCQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtnQkFDMUIsSUFBSSxHQUFHLEVBQUU7b0JBQ1AsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2lCQUNoQjtxQkFBTTtvQkFDTCxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7aUJBQ3hCO1lBQ0gsQ0FBQyxDQUFDLENBQUM7U0FDSjtJQUNILENBQUMs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