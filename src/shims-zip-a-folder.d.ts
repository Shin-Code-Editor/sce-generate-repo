declare module "zip-a-folder" {
  type zip = (path: string, to: string) => Promise<void>;

  export const zip: zip;
}
