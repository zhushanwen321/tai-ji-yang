const COMMENTS_DIR_NAME = ".od-comments";
const COMMENTS_FILE_NAME = "comments.json";
const COMMENTS_FILE_VERSION = 1;
const COMMENT_THREAD_ID_PREFIX = "c_";
const COMMENT_TEXT_MAX_LENGTH = 1e4;
const COMMENT_THREAD_STATUSES = ["open", "resolved"];
const COMMENT_DELIVERY_STATES = ["pending", "delivered", "no-agent", "inject-error"];
const COMMENTS_API_BASE_PATH = "/api/opendesign-design-mode.comments";
const COMMENTS_API_ACTION_PATHS = [".create", ".reply", ".retry", ".resolve"];
const COMMENTS_API_PATHS = [
  COMMENTS_API_BASE_PATH,
  ...COMMENTS_API_ACTION_PATHS.map((action) => COMMENTS_API_BASE_PATH + action)
];
const COMMENT_SOURCE_KIND = "opendesign-design-mode/comment";
export {
  COMMENTS_API_ACTION_PATHS,
  COMMENTS_API_BASE_PATH,
  COMMENTS_API_PATHS,
  COMMENTS_DIR_NAME,
  COMMENTS_FILE_NAME,
  COMMENTS_FILE_VERSION,
  COMMENT_DELIVERY_STATES,
  COMMENT_SOURCE_KIND,
  COMMENT_TEXT_MAX_LENGTH,
  COMMENT_THREAD_ID_PREFIX,
  COMMENT_THREAD_STATUSES
};
