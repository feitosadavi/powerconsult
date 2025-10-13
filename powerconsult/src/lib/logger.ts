export function logger(output: string, user?: {userId: string; storeId: string} ) {
  console.log(
    `[PC BACKEND] ${user ? `(${user.userId}:${user.storeId})` : ""} ${output}`
  );
}
