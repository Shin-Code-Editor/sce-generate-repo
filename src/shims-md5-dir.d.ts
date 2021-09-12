declare module "md5-dir/promise" {
  type cb = (path: string) => Promise<string>;
  const value: cb;

  export default value;
}
