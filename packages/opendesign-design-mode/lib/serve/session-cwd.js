function resolveSessionCwdById(ctx, sessionId) {
  const sessions = ctx?.sessions;
  const session = typeof sessions?.get === "function" ? sessions.get(sessionId) : void 0;
  if (session === void 0 || session === null) return null;
  let workingDirectory;
  try {
    workingDirectory = ctx?.workingDirectory;
  } catch {
  }
  if (workingDirectory && typeof workingDirectory.get === "function") {
    try {
      const cwd = workingDirectory.get(session);
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch {
    }
  }
  const headerCwd = session.header?.cwd;
  return typeof headerCwd === "string" && headerCwd.length > 0 ? headerCwd : null;
}
export {
  resolveSessionCwdById
};
