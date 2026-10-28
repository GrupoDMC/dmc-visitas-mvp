import { borrarBaseE2E } from "./base";

export default async function globalTeardown() {
  await borrarBaseE2E();
}
