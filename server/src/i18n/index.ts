import { createRequire } from "node:module";
import i18n from "i18next";

const require = createRequire(import.meta.url);
const ko = require("./ko.json");

i18n.init({
  resources: { ko: { translation: ko } },
  lng: "ko",
  interpolation: { escapeValue: false },
});

export const t = i18n.t.bind(i18n);
export default i18n;
