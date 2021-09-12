#!/usr/bin node

import path from "path";

import chalk from "chalk";
import { program } from "commander";
import fs from "fs-extra";
import md5 from "md5-dir/promise";
import { zip } from "zip-a-folder";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package.json");

program.version(version);

program
  .option("-ts, --source <string>", "folder to put the sources", __dirname)
  .option(
    "-o, --output <string>",
    "directory where the .zip and release.json files are stored",
    __dirname
  );

program.parse(process.argv);

const { source: ROOT_PATH, output: DIST_PATH } = program.opts();

type ReleaseJSON = {
  readonly name: string;
  readonly "directory-name": string;
  readonly icons?: readonly string[];
  readonly images?: readonly string[];
  readonly description?: string;
  readonly isTemplate: boolean;
  readonly mtimeMs?: number;
};
// path.join(__dirname, "../../src/assets", path.basename(__dirname));

function existsFile(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (/^https?:\/\//.test(uri)) {
      resolve(true);
    } else {
      fs.lstat(uri, (err, stat) => {
        if (err) {
          resolve(false);
        } else {
          resolve(stat.isFile());
        }
      });
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function fixTemplate(template: string): Promise<ReleaseJSON> {
  const directoryName = path.basename(template);
  const uriRelease = path.join(DIST_PATH, directoryName, "Release.json");

  const ReleaseJSONFile = (await existsFile(uriRelease))
    ? parse(fs.readFileSync(uriRelease, "utf8"))
    : {};
  const Release = {
    ...ReleaseJSONFile,
    ...parse(
      (await existsFile(path.join(template, "Release.json")))
        ? fs.readFileSync(path.join(template, "Release.json"), "utf8")
        : "{}"
    ),
  };

  // eslint-disable-next-line functional/immutable-data
  Release.name = directoryName;
  // eslint-disable-next-line functional/immutable-data
  Release["directory-name"] = directoryName;
  // eslint-disable-next-line functional/immutable-data
  Release.images = [];
  // eslint-disable-next-line functional/immutable-data
  Release.icons = [];

  await Promise.all(
    (
      await fs.readdir(template)
    ).map(async (filename) => {
      if (
        /^image_/.test(filename) &&
        (await fs.lstat(path.join(template, filename))).isFile()
      ) {
        Release.images.push(
          path.relative(directoryName, path.join(directoryName, filename))
        );

        await fs.copy(
          path.join(template, filename),
          path.join(DIST_PATH, directoryName, filename)
        );
      }

      if (
        /^icon_/.test(filename) &&
        (await fs.lstat(path.join(template, filename))).isFile()
      ) {
        Release.icons.push(
          path.relative(directoryName, path.join(directoryName, filename))
        );

        await fs.copy(
          path.join(template, filename),
          path.join(DIST_PATH, directoryName, filename)
        );
      }
    })
  );

  if (Release.images.length === 0) {
    // eslint-disable-next-line functional/immutable-data
    delete Release.images;
  }
  if (Release.icons.length === 0) {
    // eslint-disable-next-line functional/immutable-data
    delete Release.icons;
  }

  const uriFolderTemplate = path.join(template, "template");

  if (
    fs.existsSync(uriFolderTemplate) &&
    fs.statSync(uriFolderTemplate).isDirectory()
  ) {
    const md5FolderTemplate = await md5(uriFolderTemplate);
    const uriTemplateZip = path.join(DIST_PATH, directoryName, "template.zip");

    // eslint-disable-next-line functional/immutable-data
    Release.isTemplate = true;

    // eslint-disable-next-line functional/immutable-data
    Release.MD5 = md5FolderTemplate;
    if (
      fs.existsSync(uriTemplateZip) === false ||
      md5FolderTemplate !== ReleaseJSONFile.MD5
    ) {
      console.info(`${template}: creating template.zip`);
      await zip(uriFolderTemplate, uriTemplateZip);
    }

    const stat = fs.lstatSync(uriTemplateZip);
    // eslint-disable-next-line functional/immutable-data
    Release.mtimeMs = stat.mtimeMs;
  } else {
    // eslint-disable-next-line functional/immutable-data
    Release.isTemplate = false;
  }

  if (JSON.stringify(Release) !== JSON.stringify(ReleaseJSONFile)) {
    await fs.outputFile(uriRelease, JSON.stringify(Release, undefined, "  "));
    console.log(chalk.green(`${template}: Saved Release.json`));
  }

  return Release;
}

async function build() {
  const sort = [
    ...new Set(
      fs.existsSync(path.join(ROOT_PATH, "sort.txt"))
        ? fs
            .readFileSync(path.join(ROOT_PATH, "sort.txt"), "utf8")
            .split("\n")
            .map((item) => item.trim())
        : []
    ),
  ];

  // eslint-disable-next-line functional/prefer-readonly-type
  const templates: ReleaseJSON[] = (
    await Promise.all(
      fs
        .readdirSync(ROOT_PATH)
        .map(async (template: string): Promise<ReleaseJSON | void> => {
          template = path.join(ROOT_PATH, template);

          if (fs.lstatSync(template).isDirectory()) {
            return await fixTemplate(template);
          }
        })
    )
  )
    // eslint-disable-next-line functional/prefer-readonly-type
    .filter((item) => item !== undefined) as ReleaseJSON[];

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
    await fs.outputFile(path.join(ROOT_PATH, "sort.txt"), newSort.join("\n"));
    console.log(chalk.green("Saved sort.txt"));
  }

  const uriReleaseJson = path.join(DIST_PATH, "Release.json");
  const oldRelease = fs.existsSync(uriReleaseJson)
    ? parse(fs.readFileSync(uriReleaseJson, "utf8"))
    : {};

  if (JSON.stringify(oldRelease) !== JSON.stringify(templatesSorted)) {
    await fs.outputFile(
      uriReleaseJson,
      JSON.stringify(templatesSorted, undefined, "  ")
    );
    console.log(chalk.green("Saved Release.json"));
  }
}

build();
