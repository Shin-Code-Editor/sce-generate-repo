import { terser } from "rollup-plugin-terser";
import commonjs from "rollup-plugin-commonjs";
import typescript from "rollup-plugin-typescript2";

export default {
  input: "src/cli.ts",
  external: ["chalk", "commander", "md5-dir/promise", "zip-a-folder"],
  plugins: [
    commonjs(),
    typescript({
      clean: true,
      tsconfig: "./tsconfig.json",
      useTsconfigDeclarationDir: true,
    }),
  ],
  output: [
    {
      file: `bin/cli.js`,
      format: "cjs",
      plugins: [terser()],
      exports: "auto",
    },
  ],
};
