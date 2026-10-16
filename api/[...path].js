import { handler } from "../server/handler.js";

export default async function noirAPI(req, res) {
  return handler(req, res);
}
