import { UserSession } from "../playground";

export function logger(output: string, user?: UserSession) {
  console.log(
    `[PC BACKEND] ${user ? `(${user.userId}:${user.storeId})` : ""} ${output}`
  );
}
