window.__ModuleLoader__.load({
	id: "opendesign-design-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// 样式注入：普通 CSS 文本 + 显式注入（设计 D1；不用 CSS Modules，类名靠包内约定前缀隔离）
		(() => {
			var STYLE_ID = "opendesign-design-mode-styles";
			var CSS = "";
			var existing = document.getElementById(STYLE_ID);
			if (existing !== null) {
				existing.textContent = CSS;
				return;
			}
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = CSS;
			document.head.appendChild(style);
		})();
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/opendesign-design-mode/client/preview-tab/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var inject = [];
function apply(ctx) {
  ctx.logger.debug("preview-tab 骨架已物化；设计面板 tab 注册由 U7 接线");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsicGFja2FnZXMvb3BlbmRlc2lnbi1kZXNpZ24tbW9kZS9jbGllbnQvcHJldmlldy10YWIvaW5kZXgudHN4Il0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIGNsaWVudC9wcmV2aWV3LXRhYi9pbmRleC50c3gg4oCU4oCUIOiuvuiuoemihOiniOmdouadv+eahOa1j+iniOWZqOWNiuWcuua6kOWFpeWPo++8iFU3IOWhq+Wunu+8m+acrOWNleWFg+acgOWwj+mqqOaetu+8ieOAglxuICpcbiAqIOe7iOaAgeiBjOi0o++8iOiuvuiuoSBEN++8ie+8mue7jyBgY3R4LnNpZGViYXJSaWdodFRhYnNgIOazqOWGjOWPs+S+p+agj+iuvuiuoemdouadvyB0YWIg57G75Z6L77yI5Y+v5YGc6Z2gL1xuICog5YiG5bGPL+a1ruWKqO+8ie+8jOmdouadv+S9k+WGhSBpZnJhbWUg6L295YWl5Lqn54mp5Ly65pyN6Lev55Sx77yI5Ly65pyN5qC5ID0g5Lya6K+dIGN3ZO+8jGhvc3Qg5Y2KIGxpYi9zZXJ2ZS9cbiAqIGFydGlmYWN0cy1yb3V0ZS50c++8ieKAlOKAlGlmcmFtZSDkuIDlvovluKYgYHNhbmRib3g9XCJhbGxvdy1zY3JpcHRzXCJgIOS4lCoq5LiN5ZCrKiogYWxsb3ctc2FtZS1vcmlnaW5cbiAqIO+8iOS6p+eJqeiEmuacrOmalOemu+eahOe8k+ino+iQveWcsO+8jEQ3IOW9seWTjeWIhuaekO+8ie+8m+mdouadv+WGhemZhOS6p+eJqeWIl+ihqOWFnOW6leS4juWKoOi9veaAgeOAglxuICpcbiAqIOaehOW7uuW9ouaAge+8muacrOaWh+S7tuaYryBgbm9kZSBzY3JpcHRzL2J1aWxkLWNsaWVudC5tanNgIOWvueacrOWMheeahOa1j+iniOWZqOWNiuWcuuWFpeWPo++8iOWkmuWMhemAgumFjeWQjlxuICog6YCQ5YyF5p6E5bu677yJ77yM5Lqn54mpID0gbGliL2NsaWVudC5qc++8iGB3aW5kb3cuX19Nb2R1bGVMb2FkZXJfXy5sb2FkKHsgaWQsIGZhY3RvcnkgfSlgIOWlkee6pu+8ieOAglxuICogbGliL2NsaWVudC5qcyDnmoToo4Xovb3nlLHmnKzljIUgcGF0Y2gg5Li76KGM6amx5Yqo77yI5a6/5Li7IGNsaWVudC1tb2R1bGVzIOaMieihjOWQjeino+aekOWMhSBtYW5pZmVzdCDihpJcbiAqIGRzaC5jbGllbnQg4oaSIGV4cG9ydHMgYC4vY2xpZW50YO+8jOS4jiB0YWktamkteWFuZy1zaGVsbCDlkIzmnoTvvInvvJtwcmVzZXQg57uE5ZCI5YaF55qEIG9kLWNsaWVudCDooYxcbiAqIOaMh+WQkSBob3N0IOS+p+mUmueCuSBsaWIvY2xpZW50LWVudHJ5Lmpz4oCU4oCU5rWP6KeI5ZmoIGJ1bmRsZSDkuI3ov5sgaG9zdCDoo4Xovb3vvIjpobblsYIgd2luZG93IOW8leeUqO+8ieOAglxuICpcbiAqIOacrOWNleWFg++8iFUx77yJ5Y+q56uL5Y+v57yW6K+R6aqo5p6277ya5YWl5Y+j5a+85Ye6IGBpbmplY3RgIOS4jiBgYXBwbHlg77yI5LiOIHRhaS1qaS15YW5nLXNoZWxsIOeahFxuICogY2xpZW50L2FwcGx5LnRzIOWQjOaehOeahOacgOWwj+e7k+aehOexu+Wei+W9ouaAge+8ie+8jGFwcGx5IOmbtui0oeeMrueCueKAlOKAlHRhYiDms6jlhozjgIFpZnJhbWUg6KeG5Zu+5LiOXG4gKiDkuqfnianliJfooajnlLEgVTcg6JC955uY77yIY2xpZW50L3ByZXZpZXctdGFiL2lmcmFtZS12aWV3LnRzeOOAgWFydGlmYWN0LWxpc3QudHN477yJ44CCXG4gKi9cblxuLyoqIOmdouadv+a2iOi0ueeahOWuv+S4uyBjbGllbnQg5qih5Z2X77yIVTcg5o6l57q/IHNpZGViYXJSaWdodFRhYnMg5pe25oyJ6ZyA6L+95Yqg77yb6aqo5p625pyf6Zu25L6d6LWW77yJ44CCICovXG5leHBvcnQgY29uc3QgaW5qZWN0OiBzdHJpbmdbXSA9IFtdXG5cbi8qKiDmnKzljIXmtY/op4jlmajljYrlnLrnlKjliLDnmoTlrr/kuLsgY29udGV4dO+8iOacgOWwj+e7k+aehOexu+Wei++8m+S4jSBpbXBvcnQg5Lu75L2VIGRzaC1jbGllbnQg5YyF77yJ44CCICovXG5leHBvcnQgaW50ZXJmYWNlIFByZXZpZXdBcHBseUNvbnRleHQge1xuICAvKiog55m76K6w5ZCv5Yqo5Ymv5L2c55So5bm25ou/5YiwIGZpYmVyIOeUn+WRveWRqOacn+aJmOeuoe+8iOWNuOi9veaXtuWPjeW6j+aJp+ihjCBkaXNwb3Nlcu+8ieOAgiAqL1xuICBlZmZlY3QoZXhlY3V0ZTogKCkgPT4gKCkgPT4gdm9pZCwgbGFiZWw/OiBzdHJpbmcpOiB2b2lkXG4gIC8qKiDor4rmlq3ml6Xlv5fvvIjlrr/kuLvmjInljIXlkI3miZPliY3nvIDvvInjgIIgKi9cbiAgbG9nZ2VyOiB7IGRlYnVnKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQ7IHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZDsgZXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB9XG59XG5cbi8qKlxuICog5rWP6KeI5Zmo5Y2K5Zy66KOF6YWN5YWl5Y+j77yIZmFjdG9yeSDlo7PnianljJbml7bmiafooYzvvJtVNyDloavlrp4gdGFiIOazqOWGjO+8ieOAglxuICpcbiAqIEBwYXJhbSBjdHggLSDlrr/kuLsgY2xpZW50IGNvbnRleHTjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5KGN0eDogUHJldmlld0FwcGx5Q29udGV4dCk6IHZvaWQge1xuICBjdHgubG9nZ2VyLmRlYnVnKCdwcmV2aWV3LXRhYiDpqqjmnrblt7LnianljJbvvJvorr7orqHpnaLmnb8gdGFiIOazqOWGjOeUsSBVNyDmjqXnur8nKVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQW9CTyxJQUFNLFNBQW1CLENBQUM7QUFlMUIsU0FBUyxNQUFNLEtBQWdDO0FBQ3BELE1BQUksT0FBTyxNQUFNLHNDQUFzQztBQUN6RDsiLAogICJuYW1lcyI6IFtdCn0K
		return module.exports;
	}
});
