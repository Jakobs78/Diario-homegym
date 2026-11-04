import base from './playwright.config.mjs';
export default {
 ...base,
 testMatch:'**/pwa-update-lifecycle.spec.mjs',
 use:{...base.use,browserName:'webkit',viewport:{width:390,height:844}},
};
